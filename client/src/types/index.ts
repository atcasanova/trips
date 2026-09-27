export type UserRole = 'ADMIN' | 'USER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'INVITED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  avatar_url?: string | null;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserInvitation {
  id: string;
  email: string;
  name?: string | null;
  trip_id?: string | null;
  trip_role?: TripRole;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  invited_by?: string;
  invited_by_name?: string;
  created_at: string;
  expires_at: string;
}

export interface InviteDetails {
  valid: boolean;
  email: string;
  name: string;
  inviterName: string;
  tripTitle?: string | null;
  tripRole?: TripRole;
  expiresAt: string;
}

export type TripRole = 'OWNER' | 'EDITOR' | 'VIEWER';
export type TripStatus = 'PLANNING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';

export interface TripTheme {
  preset: string;
  primary: string;
  secondary: string;
  accent: string;
  text?: string;
  background?: string;
}

export interface Trip {
  id: string;
  title: string;
  subtitle?: string | null;
  tagline?: string | null;
  description?: string | null;
  destination_summary?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  primary_country?: string | null;
  cities: string[];
  timezone: string;
  status: TripStatus;
  theme: TripTheme;
  cover_image_url?: string | null;
  cover_image_thumb?: string | null;
  cover_image_attribution?: any;
  default_currency: string;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  user_role?: TripRole;
  members_count?: number;
  documents_count?: number;
  days_count?: number;
  creator_name?: string | null;
}

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string;
  role: TripRole;
  name: string;
  email: string;
  avatar_url?: string | null;
  created_at: string;
}

export interface TripTraveler {
  id: string;
  trip_id: string;
  user_id?: string | null;
  display_name: string;
  ticket_name?: string | null;
  email?: string | null;
  phone?: string | null;
  document_number?: string | null;
  role: 'OWNER' | 'EDITOR' | 'VIEWER' | 'COMPANION';
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  avatar_url?: string | null;
  is_registered_user?: boolean;
}

export interface TripDay {
  id: string;
  trip_id: string;
  date: string;
  day_number: number;
  title?: string | null;
  subtitle?: string | null;
  base_location?: string | null;
  icon?: string | null;
  narrative?: string | null;
  temperature_min?: number | null;
  temperature_max?: number | null;
  weather_description?: string | null;
  estimated_cost?: number | null;
  cost_currency?: string | null;
  included_services?: string | null;
  ideas?: string[];
  alerts?: string[];
  order_index: number;
  items?: ItineraryItem[];
}

export interface ItineraryItem {
  id: string;
  trip_id: string;
  trip_day_id: string;
  title: string;
  category: string;
  start_time?: string | null;
  end_time?: string | null;
  timezone?: string | null;
  location_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_source?: string | null;
  location_source_url?: string | null;
  location_confidence?: number | null;
  location_verified_at?: string | null;
  location_confirmed_at?: string | null;
  duration_text?: string | null;
  cost_amount?: number | null;
  cost_currency?: string | null;
  booking_reference?: string | null;
  url?: string | null;
  tips?: string | null;
  notes?: string | null;
  order_index: number;
}

export interface TransportReservation {
  id: string;
  trip_id: string;
  type: string;
  booking_code?: string | null;
  ticket_number?: string | null;
  provider_name?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  status: string;
  document_id?: string | null;
  notes?: string | null;
  segments?: TransportSegment[];
}

export interface TransportSegment {
  id: string;
  reservation_id: string;
  trip_id: string;
  trip_day_id?: string | null;
  segment_number: number;
  transport_type: string;
  carrier_name?: string | null;
  carrier_code?: string | null;
  identification_number?: string | null;
  departure_location: string;
  departure_station_code?: string | null;
  departure_date?: string | null;
  departure_time?: string | null;
  departure_timezone?: string | null;
  arrival_location: string;
  arrival_station_code?: string | null;
  arrival_date?: string | null;
  arrival_time?: string | null;
  arrival_timezone?: string | null;
  duration_minutes?: number | null;
  layover_minutes?: number | null;
  cabin_class?: string | null;
  seat?: string | null;
  baggage_allowance?: string | null;
  terminal?: string | null;
  gate?: string | null;
  passenger_names?: string[];
  notes?: string | null;
}

export interface HotelReservation {
  id: string;
  trip_id: string;
  hotel_name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  check_in_date: string;
  check_in_time?: string | null;
  check_out_date: string;
  check_out_time?: string | null;
  reservation_number?: string | null;
  guest_names?: string | null;
  room_type?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  payment_status: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  document_id?: string | null;
  notes?: string | null;
}

export interface DocumentItem {
  id: string;
  trip_id: string;
  user_id?: string | null;
  uploader_name?: string | null;
  original_name: string;
  internal_filename: string;
  mime_type: string;
  file_size: number;
  file_hash: string;
  category: string;
  ai_status: string;
  notes?: string | null;
  created_at: string;
  extraction?: {
    id: string;
    detected_type: string;
    raw_extraction: any;
    normalized_data: any;
    user_corrections?: any;
    model_used?: string | null;
    status: string;
  } | null;
}

export interface ExpenseSplit {
  id?: string;
  expense_id?: string;
  traveler_id: string;
  traveler_name?: string;
  amount: number;
  percentage?: number | null;
}

export interface TravelerBalance {
  travelerId: string;
  name: string;
  paid: number;
  owed: number;
  netBalance: number;
}

export interface Settlement {
  fromTravelerId: string;
  fromName: string;
  toTravelerId: string;
  toName: string;
  amount: number;
}

export interface ExpensesResponse {
  expenses: ExpenseItem[];
  travelers: TripTraveler[];
  totalsByCurrency: Record<string, number>;
  sharedTotalsByCurrency: Record<string, number>;
  personalTotalsByCurrency: Record<string, number>;
  balancesByCurrency: Record<string, TravelerBalance[]>;
  settlementsByCurrency: Record<string, Settlement[]>;
  categoryBreakdown: Record<
    string,
    {
      total: Record<string, number>;
      byTraveler: Record<string, Record<string, number>>;
    }
  >;
}

export interface ExpenseItem {
  id: string;
  trip_id: string;
  trip_day_id?: string | null;
  category: string;
  description: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_default_currency?: number | null;
  paid_by_user_id?: string | null;
  paid_by_traveler_id?: string | null;
  paid_by_name?: string | null;
  traveler_id?: string | null;
  payment_method: string;
  date: string;
  document_id?: string | null;
  notes?: string | null;
  is_shared: boolean;
  split_type?: string;
  splits?: ExpenseSplit[];
}

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  alt: string;
}
