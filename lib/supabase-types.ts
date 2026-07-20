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
      projects: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          project_id: string | null
          title: string
          pages: number
          file_path: string
          chunks_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id?: string | null
          title: string
          pages?: number
          file_path: string
          chunks_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string | null
          title?: string
          pages?: number
          file_path?: string
          chunks_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      translation_jobs: {
        Row: {
          id: string
          document_id: string
          target_language: string
          source_language: string | null
          provider: string
          model: string
          status: string
          progress_percentage: number
          current_chunk: number
          total_chunks: number
          current_section: string | null
          error_message: string | null
          output_path: string | null
          stats: Json | null
          created_at: string
          updated_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          document_id: string
          target_language: string
          source_language?: string | null
          provider: string
          model: string
          status?: string
          progress_percentage?: number
          current_chunk?: number
          total_chunks?: number
          current_section?: string | null
          error_message?: string | null
          output_path?: string | null
          stats?: Json | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          document_id?: string
          target_language?: string
          source_language?: string | null
          provider?: string
          model?: string
          status?: string
          progress_percentage?: number
          current_chunk?: number
          total_chunks?: number
          current_section?: string | null
          error_message?: string | null
          output_path?: string | null
          stats?: Json | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
      }
      settings: {
        Row: {
          id: string
          openai_key: string | null
          google_key: string | null
          xai_key: string | null
          models: Json
          prices_usd: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          openai_key?: string | null
          google_key?: string | null
          xai_key?: string | null
          models?: Json
          prices_usd?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          openai_key?: string | null
          google_key?: string | null
          xai_key?: string | null
          models?: Json
          prices_usd?: Json
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
