export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      body_measurements: {
        Row: {
          arms_cm: number | null
          body_fat_pct: number | null
          chest_cm: number | null
          created_at: string | null
          hips_cm: number | null
          id: string
          logged_date: string
          neck_cm: number | null
          thighs_cm: number | null
          user_id: string
          waist_cm: number | null
        }
        Insert: {
          arms_cm?: number | null
          body_fat_pct?: number | null
          chest_cm?: number | null
          created_at?: string | null
          hips_cm?: number | null
          id?: string
          logged_date?: string
          neck_cm?: number | null
          thighs_cm?: number | null
          user_id: string
          waist_cm?: number | null
        }
        Update: {
          arms_cm?: number | null
          body_fat_pct?: number | null
          chest_cm?: number | null
          created_at?: string | null
          hips_cm?: number | null
          id?: string
          logged_date?: string
          neck_cm?: number | null
          thighs_cm?: number | null
          user_id?: string
          waist_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_measurements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          chat_date: string | null
          content: string
          created_at: string | null
          id: string
          meal_log_id: string | null
          message_type: string | null
          role: string
          user_id: string
        }
        Insert: {
          chat_date?: string | null
          content: string
          created_at?: string | null
          id?: string
          meal_log_id?: string | null
          message_type?: string | null
          role: string
          user_id: string
        }
        Update: {
          chat_date?: string | null
          content?: string
          created_at?: string | null
          id?: string
          meal_log_id?: string | null
          message_type?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_meal_log_id_fkey"
            columns: ["meal_log_id"]
            isOneToOne: false
            referencedRelation: "meal_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_summaries: {
        Row: {
          id: string
          meal_count: number | null
          summary_date: string
          total_calories: number | null
          total_carbs_g: number | null
          total_fat_g: number | null
          total_protein_g: number | null
          total_water_ml: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          meal_count?: number | null
          summary_date?: string
          total_calories?: number | null
          total_carbs_g?: number | null
          total_fat_g?: number | null
          total_protein_g?: number | null
          total_water_ml?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          meal_count?: number | null
          summary_date?: string
          total_calories?: number | null
          total_carbs_g?: number | null
          total_fat_g?: number | null
          total_protein_g?: number | null
          total_water_ml?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_summaries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      food_entries: {
        Row: {
          ai_confidence: number | null
          calories: number
          carbs_g: number
          created_at: string | null
          fat_g: number
          fiber_g: number | null
          food_item_id: string | null
          food_name: string
          id: string
          macro_source: string | null
          meal_log_id: string
          protein_g: number
          quantity_g: number
          quantity_label: string | null
          sodium_mg: number | null
          source: string | null
          sugar_g: number | null
          user_id: string
        }
        Insert: {
          ai_confidence?: number | null
          calories: number
          carbs_g?: number
          created_at?: string | null
          fat_g?: number
          fiber_g?: number | null
          food_item_id?: string | null
          food_name: string
          id?: string
          macro_source?: string | null
          meal_log_id: string
          protein_g?: number
          quantity_g: number
          quantity_label?: string | null
          sodium_mg?: number | null
          source?: string | null
          sugar_g?: number | null
          user_id: string
        }
        Update: {
          ai_confidence?: number | null
          calories?: number
          carbs_g?: number
          created_at?: string | null
          fat_g?: number
          fiber_g?: number | null
          food_item_id?: string | null
          food_name?: string
          id?: string
          macro_source?: string | null
          meal_log_id?: string
          protein_g?: number
          quantity_g?: number
          quantity_label?: string | null
          sodium_mg?: number | null
          source?: string | null
          sugar_g?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_entries_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_entries_meal_log_id_fkey"
            columns: ["meal_log_id"]
            isOneToOne: false
            referencedRelation: "meal_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      food_items: {
        Row: {
          barcode: string | null
          brand: string | null
          calories: number | null
          calories_per_100g: number | null
          carbs_g: number | null
          carbs_per_100g: number | null
          created_at: string | null
          created_by: string | null
          external_id: string | null
          fat_g: number | null
          fat_per_100g: number | null
          fdc_id: number | null
          fiber_g: number | null
          fiber_per_100g: number | null
          id: string
          last_used_at: string | null
          name: string
          normalized_name: string | null
          protein_g: number | null
          protein_per_100g: number | null
          serving_size_description: string | null
          serving_size_g: number | null
          sodium_mg: number | null
          source: string | null
          sugar_g: number | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          calories?: number | null
          calories_per_100g?: number | null
          carbs_g?: number | null
          carbs_per_100g?: number | null
          created_at?: string | null
          created_by?: string | null
          external_id?: string | null
          fat_g?: number | null
          fat_per_100g?: number | null
          fdc_id?: number | null
          fiber_g?: number | null
          fiber_per_100g?: number | null
          id?: string
          last_used_at?: string | null
          name: string
          normalized_name?: string | null
          protein_g?: number | null
          protein_per_100g?: number | null
          serving_size_description?: string | null
          serving_size_g?: number | null
          sodium_mg?: number | null
          source?: string | null
          sugar_g?: number | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          calories?: number | null
          calories_per_100g?: number | null
          carbs_g?: number | null
          carbs_per_100g?: number | null
          created_at?: string | null
          created_by?: string | null
          external_id?: string | null
          fat_g?: number | null
          fat_per_100g?: number | null
          fdc_id?: number | null
          fiber_g?: number | null
          fiber_per_100g?: number | null
          id?: string
          last_used_at?: string | null
          name?: string
          normalized_name?: string | null
          protein_g?: number | null
          protein_per_100g?: number | null
          serving_size_description?: string | null
          serving_size_g?: number | null
          sodium_mg?: number | null
          source?: string | null
          sugar_g?: number | null
        }
        Relationships: []
      }
      meal_logs: {
        Row: {
          caption: string | null
          created_at: string | null
          id: string
          logged_date: string
          meal_type: string
          photo_url: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          logged_date?: string
          meal_type: string
          photo_url?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          id?: string
          logged_date?: string
          meal_type?: string
          photo_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activity_level: string | null
          avatar_url: string | null
          calorie_goal: number | null
          carb_goal_g: number | null
          created_at: string | null
          current_weight_kg: number | null
          date_of_birth: string | null
          deadline_date: string | null
          dietary_restrictions: string[] | null
          fat_goal_g: number | null
          full_name: string | null
          goal: string | null
          goal_weight_kg: number | null
          height_cm: number | null
          id: string
          onboarding_complete: boolean | null
          protein_goal_g: number | null
          sex: string | null
          subscription_tier: string | null
          units_system: string | null
          updated_at: string | null
          water_goal_ml: number | null
          water_tracking_enabled: boolean
        }
        Insert: {
          activity_level?: string | null
          avatar_url?: string | null
          calorie_goal?: number | null
          carb_goal_g?: number | null
          created_at?: string | null
          current_weight_kg?: number | null
          date_of_birth?: string | null
          deadline_date?: string | null
          dietary_restrictions?: string[] | null
          fat_goal_g?: number | null
          full_name?: string | null
          goal?: string | null
          goal_weight_kg?: number | null
          height_cm?: number | null
          id: string
          onboarding_complete?: boolean | null
          protein_goal_g?: number | null
          sex?: string | null
          subscription_tier?: string | null
          units_system?: string | null
          updated_at?: string | null
          water_goal_ml?: number | null
          water_tracking_enabled?: boolean
        }
        Update: {
          activity_level?: string | null
          avatar_url?: string | null
          calorie_goal?: number | null
          carb_goal_g?: number | null
          created_at?: string | null
          current_weight_kg?: number | null
          date_of_birth?: string | null
          deadline_date?: string | null
          dietary_restrictions?: string[] | null
          fat_goal_g?: number | null
          full_name?: string | null
          goal?: string | null
          goal_weight_kg?: number | null
          height_cm?: number | null
          id?: string
          onboarding_complete?: boolean | null
          protein_goal_g?: number | null
          sex?: string | null
          subscription_tier?: string | null
          units_system?: string | null
          updated_at?: string | null
          water_goal_ml?: number | null
          water_tracking_enabled?: boolean
        }
        Relationships: []
      }
      streaks: {
        Row: {
          current_streak: number | null
          id: string
          last_logged_date: string | null
          longest_streak: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          current_streak?: number | null
          id?: string
          last_logged_date?: string | null
          longest_streak?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          current_streak?: number | null
          id?: string
          last_logged_date?: string | null
          longest_streak?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_limits: {
        Row: {
          ai_photo_scans_today: number | null
          barcode_scans_today: number | null
          chat_messages_today: number | null
          date: string
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_photo_scans_today?: number | null
          barcode_scans_today?: number | null
          chat_messages_today?: number | null
          date?: string
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_photo_scans_today?: number | null
          barcode_scans_today?: number | null
          chat_messages_today?: number | null
          date?: string
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_food_preferences: {
        Row: {
          created_at: string | null
          edit_count: number | null
          food_name: string
          id: string
          last_used_at: string | null
          normalized_name: string
          preferred_calories_per_g: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          edit_count?: number | null
          food_name: string
          id?: string
          last_used_at?: string | null
          normalized_name: string
          preferred_calories_per_g?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          edit_count?: number | null
          food_name?: string
          id?: string
          last_used_at?: string | null
          normalized_name?: string
          preferred_calories_per_g?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_food_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      water_logs: {
        Row: {
          amount_ml: number
          id: string
          logged_at: string | null
          logged_date: string
          user_id: string
        }
        Insert: {
          amount_ml: number
          id?: string
          logged_at?: string | null
          logged_date?: string
          user_id: string
        }
        Update: {
          amount_ml?: number
          id?: string
          logged_at?: string | null
          logged_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "water_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_logs: {
        Row: {
          created_at: string | null
          id: string
          logged_date: string
          notes: string | null
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          logged_date?: string
          notes?: string | null
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string | null
          id?: string
          logged_date?: string
          notes?: string | null
          user_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      reset_daily_usage_limits: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
