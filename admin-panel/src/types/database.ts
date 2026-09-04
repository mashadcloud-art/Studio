export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      staff: {
        Row: {
          id: string
          name: string
          phone: string
          address: string | null
          joining_date: string
          salary: number
          overtime_rate: number
          role: 'admin' | 'staff' | 'receptionist'
          active: boolean
          avatar_url: string | null
          speciality: string | null
          staff_code: string | null
          owner_notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          phone: string
          address?: string | null
          joining_date: string
          salary: number
          overtime_rate?: number
          role?: 'admin' | 'staff' | 'receptionist'
          active?: boolean
          avatar_url?: string | null
          speciality?: string | null
          staff_code?: string | null
          owner_notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          phone?: string
          address?: string | null
          joining_date?: string
          salary?: number
          overtime_rate?: number
          role?: 'admin' | 'staff' | 'receptionist'
          active?: boolean
          avatar_url?: string | null
          speciality?: string | null
          staff_code?: string | null
          owner_notes?: string | null
          created_at?: string
        }
      }
      customers: {
        Row: {
          id: string
          name: string
          phone: string
          address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          phone: string
          address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          phone?: string
          address?: string | null
          created_at?: string
        }
      }
      services: {
        Row: {
          id: string
          name: string
          price: number
          duration: number
          category: string | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          price: number
          duration: number
          category?: string | null
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          price?: number
          duration?: number
          category?: string | null
          active?: boolean
          created_at?: string
        }
      }
      work_records: {
        Row: {
          id: string
          staff_id: string
          customer_id: string
          service_id: string
          start_time: string
          end_time: string | null
          amount: number
          notes: string | null
          date: string
          created_at: string
        }
        Insert: {
          id?: string
          staff_id: string
          customer_id: string
          service_id: string
          start_time: string
          end_time?: string | null
          amount: number
          notes?: string | null
          date?: string
          created_at?: string
        }
        Update: {
          id?: string
          staff_id?: string
          customer_id?: string
          service_id?: string
          start_time?: string
          end_time?: string | null
          amount?: number
          notes?: string | null
          date?: string
          created_at?: string
        }
      }
      overtime: {
        Row: {
          id: string
          staff_id: string
          date: string
          total_minutes: number
          created_at: string
        }
        Insert: {
          id?: string
          staff_id: string
          date: string
          total_minutes: number
          created_at?: string
        }
        Update: {
          id?: string
          staff_id?: string
          date?: string
          total_minutes?: number
          created_at?: string
        }
      }
      settings: {
        Row: {
          id: string
          key: string
          value: string
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          value: string
          updated_at?: string
        }
        Update: {
          id?: string
          key?: string
          value?: string
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: 'admin' | 'staff' | 'receptionist'
    }
  }
}

// Convenience types
export type Staff = Database['public']['Tables']['staff']['Row']
export type Customer = Database['public']['Tables']['customers']['Row']
export type Service = Database['public']['Tables']['services']['Row']
export type WorkRecord = Database['public']['Tables']['work_records']['Row']
export type Overtime = Database['public']['Tables']['overtime']['Row']
export type Settings = Database['public']['Tables']['settings']['Row']

export interface WorkRecordWithRelations extends WorkRecord {
  staff: Staff
  customers: Customer
  services: Service
}
