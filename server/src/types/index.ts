export type UserRole = 'ADMIN' | 'USER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

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

export type TripRole = 'OWNER' | 'EDITOR' | 'VIEWER';
export type TripStatus = 'PLANNING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';

export interface TripTheme {
  preset: string; // 'sakura' | 'ocean' | 'sunset' | 'forest' | 'midnight' | 'cyber' | 'minimal'
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
  user_role?: TripRole; // Current user's role in this trip
  members_count?: number;
  documents_count?: number;
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
  original_name: string;
  internal_filename: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  file_hash: string;
  category: string;
  ai_status: string;
  notes?: string | null;
  created_at: string;
  extraction?: DocumentAIExtraction | null;
}

export interface DocumentAIExtraction {
  id: string;
  document_id: string;
  trip_id: string;
  detected_type: string;
  raw_extraction: any;
  normalized_data: any;
  user_corrections?: any;
  model_used?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  duration_ms?: number | null;
  status: string;
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
  paid_by_name?: string | null;
  payment_method: string;
  date: string;
  document_id?: string | null;
  notes?: string | null;
}
