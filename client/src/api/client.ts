import {
  User,
  Trip,
  TripMember,
  TripTraveler,
  TripDay,
  ItineraryItem,
  TransportReservation,
  HotelReservation,
  DocumentItem,
  ExpenseItem,
  ExpensesResponse,
  PexelsPhoto,
  UserInvitation,
  InviteDetails,
} from '../types/index.js';

const API_BASE = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const config: RequestInit = {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  };

  // Remove Content-Type if FormData
  if (options.body instanceof FormData) {
    delete (config.headers as any)['Content-Type'];
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorMsg = `Erro ${response.status}: ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson.error) errorMsg = errorJson.error;
    } catch (e) {}
    throw new Error(errorMsg);
  }

  return response.json();
}

export const api = {
  // === HEALTH & SYSTEM ===
  health: {
    check: () => request<any>('/health'),
  },

  // === AUTH ===
  auth: {
    login: (credentials: { email: string; password: string; turnstileToken?: string }) =>
      request<{ user: User; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
    me: () => request<{ user: User }>('/auth/me'),
    updatePassword: (passwords: { currentPassword: string; newPassword: string }) =>
      request<{ message: string }>('/auth/password', {
        method: 'POST',
        body: JSON.stringify(passwords),
      }),
  },

  // === USERS (ADMIN) ===
  users: {
    list: () => request<{ users: User[] }>('/users'),
    create: (data: { email: string; name: string; role: string; avatar_url?: string }) =>
      request<{ user: User; inviteLink?: string; rawToken?: string; message?: string }>('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<User> & { password?: string }) =>
      request<{ user: User }>(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) => request<{ message: string }>(`/users/${id}`, { method: 'DELETE' }),
  },

  // === INVITES ===
  invites: {
    create: (data: { email: string; name?: string; tripId?: string; tripRole?: string }) =>
      request<{
        message: string;
        inviteLink?: string;
        rawToken?: string;
        alreadyRegistered?: boolean;
        user?: any;
        invite?: UserInvitation;
      }>('/invites', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    get: (token: string) =>
      request<InviteDetails>(`/invites/${token}`),
    accept: (token: string, data: { name?: string; password: string }) =>
      request<{ message: string; user: User; tripId?: string }>(`/invites/${token}/accept`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    listTrip: (tripId: string) =>
      request<{ invitations: UserInvitation[] }>(`/trips/${tripId}/invitations`),
    revoke: (id: string) =>
      request<{ message: string }>(`/invites/${id}`, { method: 'DELETE' }),
  },

  // === TRIPS ===
  trips: {
    list: () => request<{ trips: Trip[] }>('/trips'),
    get: (id: string) => request<{ trip: Trip & { members: TripMember[] } }>(`/trips/${id}`),
    create: (data: Partial<Trip>) =>
      request<{ trip: Trip }>('/trips', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Trip>) =>
      request<{ trip: Trip }>(`/trips/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) => request<{ message: string }>(`/trips/${id}`, { method: 'DELETE' }),

    // Members
    addMember: (tripId: string, data: { email: string; role: string }) =>
      request<{ member: TripMember; invited?: boolean; inviteLink?: string; message?: string }>(`/trips/${tripId}/members`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateMember: (tripId: string, memberId: string, role: string) =>
      request<{ member: TripMember }>(`/trips/${tripId}/members/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    removeMember: (tripId: string, memberId: string) =>
      request<{ message: string }>(`/trips/${tripId}/members/${memberId}`, {
        method: 'DELETE',
      }),

    // Travelers & Companions
    listTravelers: (tripId: string) => request<{ travelers: TripTraveler[] }>(`/trips/${tripId}/travelers`),
    createCompanion: (
      tripId: string,
      data: { displayName: string; ticketName?: string; email?: string; documentNumber?: string; phone?: string }
    ) =>
      request<{ traveler: TripTraveler }>(`/trips/${tripId}/travelers`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateTraveler: (tripId: string, travelerId: string, data: Partial<TripTraveler>) =>
      request<{ traveler: TripTraveler }>(`/trips/${tripId}/travelers/${travelerId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteTraveler: (tripId: string, travelerId: string) =>
      request<{ message: string }>(`/trips/${tripId}/travelers/${travelerId}`, {
        method: 'DELETE',
      }),
  },

  // === DAYS & ITINERARY ===
  days: {
    list: (tripId: string) => request<{ days: TripDay[] }>(`/trips/${tripId}/days`),
    create: (tripId: string, data: Partial<TripDay>) =>
      request<{ day: TripDay }>(`/trips/${tripId}/days`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (tripId: string, dayId: string, data: Partial<TripDay>) =>
      request<{ day: TripDay }>(`/trips/${tripId}/days/${dayId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (tripId: string, dayId: string) =>
      request<{ message: string }>(`/trips/${tripId}/days/${dayId}`, { method: 'DELETE' }),

    // Itinerary items
    createItem: (tripId: string, dayId: string, data: Partial<ItineraryItem>) =>
      request<{ item: ItineraryItem }>(`/trips/${tripId}/days/${dayId}/items`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateItem: (tripId: string, dayId: string, itemId: string, data: Partial<ItineraryItem>) =>
      request<{ item: ItineraryItem }>(`/trips/${tripId}/days/${dayId}/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteItem: (tripId: string, dayId: string, itemId: string) =>
      request<{ message: string }>(`/trips/${tripId}/days/${dayId}/items/${itemId}`, {
        method: 'DELETE',
      }),
    refreshLocations: (tripId: string, dayId?: string) =>
      request<{
        locationRefresh: {
          candidates: number;
          resolved: number;
          updated: number;
          skippedConfirmedLocations: number;
          error?: string;
        };
      }>(
        `/trips/${tripId}/itinerary/locations/refresh`,
        { method: 'POST', body: dayId ? JSON.stringify({ dayId }) : undefined }
      ),
    setLocationConfirmation: (tripId: string, itemId: string, confirmed: boolean) =>
      request<{ item: ItineraryItem }>(`/trips/${tripId}/itinerary/items/${itemId}/location-confirmation`, {
        method: 'PUT',
        body: JSON.stringify({ confirmed }),
      }),
    reorder: (tripId: string, dayIds: string[]) =>
      request<{ days: TripDay[] }>(`/trips/${tripId}/days/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ dayIds }),
      }),
    reorderItems: (tripId: string, dayId: string, itemIds: string[]) =>
      request<{ items: ItineraryItem[] }>(`/trips/${tripId}/days/${dayId}/items/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ itemIds }),
      }),
    moveItem: (tripId: string, itemId: string, data: { targetDayId: string; newOrderIndex?: number }) =>
      request<{ item: ItineraryItem }>(`/trips/${tripId}/days/items/${itemId}/move`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  // === RESERVATIONS ===
  reservations: {
    listTransports: (tripId: string) =>
      request<{ transports: TransportReservation[] }>(`/trips/${tripId}/transports`),
    createTransport: (tripId: string, data: any) =>
      request<{ transport: TransportReservation }>(`/trips/${tripId}/transports`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteTransport: (tripId: string, transportId: string) =>
      request<{ message: string }>(`/trips/${tripId}/transports/${transportId}`, {
        method: 'DELETE',
      }),

    listHotels: (tripId: string) => request<{ hotels: HotelReservation[] }>(`/trips/${tripId}/hotels`),
    createHotel: (tripId: string, data: Partial<HotelReservation>) =>
      request<{ hotel: HotelReservation }>(`/trips/${tripId}/hotels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteHotel: (tripId: string, hotelId: string) =>
      request<{ message: string }>(`/trips/${tripId}/hotels/${hotelId}`, {
        method: 'DELETE',
      }),
  },

  // === DOCUMENTS & AI EXTRACTION ===
  documents: {
    list: (tripId: string) => request<{ documents: DocumentItem[] }>(`/trips/${tripId}/documents`),
    upload: (tripId: string, file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return request<{ document: DocumentItem; aiResult: any }>(`/trips/${tripId}/documents/upload`, {
        method: 'POST',
        body: formData,
      });
    },
    confirmExtraction: (
      tripId: string,
      documentId: string,
      data: { confirmedType: string; normalizedData: any; userCorrections?: any; travelerAssociations?: any[] }
    ) =>
      request<{ message: string }>(`/trips/${tripId}/documents/${documentId}/confirm`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    reprocess: (tripId: string, documentId: string) =>
      request<{ document: DocumentItem; aiResult: any }>(`/trips/${tripId}/documents/${documentId}/reprocess`, {
        method: 'POST',
      }),
    delete: (tripId: string, documentId: string) =>
      request<{ message: string }>(`/trips/${tripId}/documents/${documentId}`, {
        method: 'DELETE',
      }),
    viewUrl: (documentId: string) => `/api/documents/${documentId}/file`,
  },

  // === AI TRAVEL ASSISTANT ===
  ai: {
    generateDayNarrative: (tripId: string, dayId: string) =>
      request<{ narrative: string; durationMs: number }>(`/trips/${tripId}/ai/days/${dayId}/narrative`, {
        method: 'POST',
      }),
    parseItinerary: (
      tripId: string,
      data: { text: string; replaceExisting?: boolean; apply?: boolean }
    ) =>
      request<{ days: any[]; message: string; durationMs: number }>(`/trips/${tripId}/ai/itinerary-parse`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getPexelsSuggestions: (tripId: string) =>
      request<{ queries: string[] }>(`/trips/${tripId}/ai/pexels-suggestions`),
    listLogs: (tripId: string) => request<{ logs: any[] }>(`/trips/${tripId}/ai/logs`),
  },

  // === PEXELS ===
  pexels: {
    search: (query: string, perPage: number = 15, page: number = 1) =>
      request<{ photos: PexelsPhoto[]; total_results: number }>(
        `/pexels/search?q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`
      ),
  },

  // === REPORTS & TRIP BOOK ===
  reports: {
    getData: (tripId: string) => request<any>(`/trips/${tripId}/report/data`),
    getHtmlUrl: (tripId: string) => `/api/trips/${tripId}/report/html`,
    getPdfUrl: (tripId: string) => `/api/trips/${tripId}/report/pdf`,
  },

  // === EXPENSES ===
  expenses: {
    list: (tripId: string) => request<ExpensesResponse>(`/trips/${tripId}/expenses`),
    create: (tripId: string, data: Partial<ExpenseItem> & { splits?: any[] }) =>
      request<{ expense: ExpenseItem }>(`/trips/${tripId}/expenses`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (tripId: string, expenseId: string, data: Partial<ExpenseItem> & { splits?: any[] }) =>
      request<{ message: string }>(`/trips/${tripId}/expenses/${expenseId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (tripId: string, expenseId: string) =>
      request<{ message: string }>(`/trips/${tripId}/expenses/${expenseId}`, {
        method: 'DELETE',
      }),
  },
};
