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
      app_settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      assumptions: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          key: string
          rationale: string | null
          reviewed_at: string | null
          scenario: string
          source: string | null
          unit: string | null
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          key: string
          rationale?: string | null
          reviewed_at?: string | null
          scenario?: string
          source?: string | null
          unit?: string | null
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          key?: string
          rationale?: string | null
          reviewed_at?: string | null
          scenario?: string
          source?: string | null
          unit?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          amount: number | null
          completed_on: string | null
          created_at: string
          event_date: string
          id: string
          kind: string
          notes: string | null
          recurrence: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          completed_on?: string | null
          created_at?: string
          event_date: string
          id?: string
          kind?: string
          notes?: string | null
          recurrence?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          completed_on?: string | null
          created_at?: string
          event_date?: string
          id?: string
          kind?: string
          notes?: string | null
          recurrence?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          current_cost: number
          current_savings: number
          equity_allocation_pct: number | null
          expected_return_pct: number | null
          id: string
          inflation_pct: number | null
          is_demo: boolean
          name: string
          notes: string | null
          priority: string | null
          target_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_cost?: number
          current_savings?: number
          equity_allocation_pct?: number | null
          expected_return_pct?: number | null
          id?: string
          inflation_pct?: number | null
          is_demo?: boolean
          name: string
          notes?: string | null
          priority?: string | null
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_cost?: number
          current_savings?: number
          equity_allocation_pct?: number | null
          expected_return_pct?: number | null
          id?: string
          inflation_pct?: number | null
          is_demo?: boolean
          name?: string
          notes?: string | null
          priority?: string | null
          target_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      holdings: {
        Row: {
          asset_class: string
          avg_price: number | null
          cap_segment: string | null
          category: string | null
          cost_basis: number | null
          created_at: string
          current_price: number | null
          current_value: number | null
          geography: string | null
          id: string
          instrument_type: string
          interest_rate: number | null
          is_demo: boolean
          isin: string | null
          liquidity: string | null
          maturity_date: string | null
          name: string
          notes: string | null
          price_source: string
          price_updated_at: string | null
          purchase_date: string | null
          quantity: number | null
          sector: string | null
          symbol: string | null
          target_allocation_pct: number | null
          tax_treatment: string | null
          updated_at: string
        }
        Insert: {
          asset_class: string
          avg_price?: number | null
          cap_segment?: string | null
          category?: string | null
          cost_basis?: number | null
          created_at?: string
          current_price?: number | null
          current_value?: number | null
          geography?: string | null
          id?: string
          instrument_type: string
          interest_rate?: number | null
          is_demo?: boolean
          isin?: string | null
          liquidity?: string | null
          maturity_date?: string | null
          name: string
          notes?: string | null
          price_source?: string
          price_updated_at?: string | null
          purchase_date?: string | null
          quantity?: number | null
          sector?: string | null
          symbol?: string | null
          target_allocation_pct?: number | null
          tax_treatment?: string | null
          updated_at?: string
        }
        Update: {
          asset_class?: string
          avg_price?: number | null
          cap_segment?: string | null
          category?: string | null
          cost_basis?: number | null
          created_at?: string
          current_price?: number | null
          current_value?: number | null
          geography?: string | null
          id?: string
          instrument_type?: string
          interest_rate?: number | null
          is_demo?: boolean
          isin?: string | null
          liquidity?: string | null
          maturity_date?: string | null
          name?: string
          notes?: string | null
          price_source?: string
          price_updated_at?: string | null
          purchase_date?: string | null
          quantity?: number | null
          sector?: string | null
          symbol?: string | null
          target_allocation_pct?: number | null
          tax_treatment?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      market_data: {
        Row: {
          confidence: string
          created_at: string
          currency: string
          data_date: string | null
          fetched_at: string
          freshness: string
          id: string
          kind: string
          label: string | null
          note: string | null
          source: string
          source_type: string
          source_url: string | null
          symbol: string
          updated_at: string
          value: number
        }
        Insert: {
          confidence?: string
          created_at?: string
          currency?: string
          data_date?: string | null
          fetched_at?: string
          freshness?: string
          id?: string
          kind: string
          label?: string | null
          note?: string | null
          source: string
          source_type?: string
          source_url?: string | null
          symbol: string
          updated_at?: string
          value: number
        }
        Update: {
          confidence?: string
          created_at?: string
          currency?: string
          data_date?: string | null
          fetched_at?: string
          freshness?: string
          id?: string
          kind?: string
          label?: string | null
          note?: string | null
          source?: string
          source_type?: string
          source_url?: string | null
          symbol?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      planned_investments: {
        Row: {
          annual_step_up_pct: number
          asset_class: string
          created_at: string
          end_date: string | null
          expected_return_pct: number | null
          frequency: string
          id: string
          instrument_type: string | null
          is_demo: boolean
          is_paused: boolean
          isin: string | null
          liquidity: string | null
          monthly_amount: number
          name: string
          notes: string | null
          objective: string | null
          risk_level: string | null
          start_date: string | null
          symbol: string | null
          tax_treatment: string | null
          updated_at: string
        }
        Insert: {
          annual_step_up_pct?: number
          asset_class: string
          created_at?: string
          end_date?: string | null
          expected_return_pct?: number | null
          frequency?: string
          id?: string
          instrument_type?: string | null
          is_demo?: boolean
          is_paused?: boolean
          isin?: string | null
          liquidity?: string | null
          monthly_amount?: number
          name: string
          notes?: string | null
          objective?: string | null
          risk_level?: string | null
          start_date?: string | null
          symbol?: string | null
          tax_treatment?: string | null
          updated_at?: string
        }
        Update: {
          annual_step_up_pct?: number
          asset_class?: string
          created_at?: string
          end_date?: string | null
          expected_return_pct?: number | null
          frequency?: string
          id?: string
          instrument_type?: string | null
          is_demo?: boolean
          is_paused?: boolean
          isin?: string | null
          liquidity?: string | null
          monthly_amount?: number
          name?: string
          notes?: string | null
          objective?: string | null
          risk_level?: string | null
          start_date?: string | null
          symbol?: string | null
          tax_treatment?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profile: {
        Row: {
          annual_bonus: number | null
          created_at: string
          current_age: number | null
          dependents: number | null
          emergency_months_target: number | null
          essential_monthly_expenses: number | null
          existing_cash: number | null
          existing_debt: number | null
          expected_salary_growth: number | null
          id: string
          investment_horizon_years: number | null
          job_stability: string | null
          location: string | null
          monthly_expenses: number | null
          monthly_income: number | null
          notes: string | null
          planning_age: number | null
          retirement_age: number | null
          risk_tolerance: string | null
          tax_regime: string | null
          updated_at: string
        }
        Insert: {
          annual_bonus?: number | null
          created_at?: string
          current_age?: number | null
          dependents?: number | null
          emergency_months_target?: number | null
          essential_monthly_expenses?: number | null
          existing_cash?: number | null
          existing_debt?: number | null
          expected_salary_growth?: number | null
          id?: string
          investment_horizon_years?: number | null
          job_stability?: string | null
          location?: string | null
          monthly_expenses?: number | null
          monthly_income?: number | null
          notes?: string | null
          planning_age?: number | null
          retirement_age?: number | null
          risk_tolerance?: string | null
          tax_regime?: string | null
          updated_at?: string
        }
        Update: {
          annual_bonus?: number | null
          created_at?: string
          current_age?: number | null
          dependents?: number | null
          emergency_months_target?: number | null
          essential_monthly_expenses?: number | null
          existing_cash?: number | null
          existing_debt?: number | null
          expected_salary_growth?: number | null
          id?: string
          investment_horizon_years?: number | null
          job_stability?: string | null
          location?: string | null
          monthly_expenses?: number | null
          monthly_income?: number | null
          notes?: string | null
          planning_age?: number | null
          retirement_age?: number | null
          risk_tolerance?: string | null
          tax_regime?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          created_at: string
          decisions: Json
          id: string
          invested: number | null
          notes: string | null
          open_actions: number
          period: string
          reviewed_at: string
          total_value: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decisions?: Json
          id?: string
          invested?: number | null
          notes?: string | null
          open_actions?: number
          period: string
          reviewed_at?: string
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decisions?: Json
          id?: string
          invested?: number | null
          notes?: string | null
          open_actions?: number
          period?: string
          reviewed_at?: string
          total_value?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      snapshots: {
        Row: {
          allocation: Json
          created_at: string
          id: string
          invested: number
          payload: Json
          taken_on: string
          total_value: number
          unrealised_gain: number
        }
        Insert: {
          allocation?: Json
          created_at?: string
          id?: string
          invested?: number
          payload?: Json
          taken_on?: string
          total_value?: number
          unrealised_gain?: number
        }
        Update: {
          allocation?: Json
          created_at?: string
          id?: string
          invested?: number
          payload?: Json
          taken_on?: string
          total_value?: number
          unrealised_gain?: number
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          asset_class: string
          created_at: string
          currency: string
          external_id: string | null
          fees: number
          holding_id: string | null
          id: string
          instrument_type: string
          is_demo: boolean
          isin: string | null
          kind: string
          name: string
          notes: string | null
          price: number | null
          quantity: number | null
          settlement_date: string | null
          source: string
          symbol: string | null
          taxes: number
          trade_date: string
          updated_at: string
        }
        Insert: {
          amount?: number
          asset_class?: string
          created_at?: string
          currency?: string
          external_id?: string | null
          fees?: number
          holding_id?: string | null
          id?: string
          instrument_type?: string
          is_demo?: boolean
          isin?: string | null
          kind: string
          name: string
          notes?: string | null
          price?: number | null
          quantity?: number | null
          settlement_date?: string | null
          source?: string
          symbol?: string | null
          taxes?: number
          trade_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          asset_class?: string
          created_at?: string
          currency?: string
          external_id?: string | null
          fees?: number
          holding_id?: string | null
          id?: string
          instrument_type?: string
          is_demo?: boolean
          isin?: string | null
          kind?: string
          name?: string
          notes?: string | null
          price?: number | null
          quantity?: number | null
          settlement_date?: string | null
          source?: string
          symbol?: string | null
          taxes?: number
          trade_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          asset_class: string
          created_at: string
          id: string
          instrument_type: string | null
          isin: string | null
          last_price: number | null
          name: string
          notes: string | null
          price_currency: string
          price_updated_at: string | null
          quote_source: string | null
          reference_price: number | null
          reference_set_on: string | null
          scheme_code: string | null
          symbol: string | null
          target_buy_price: number | null
          thesis: string | null
          updated_at: string
        }
        Insert: {
          asset_class?: string
          created_at?: string
          id?: string
          instrument_type?: string | null
          isin?: string | null
          last_price?: number | null
          name: string
          notes?: string | null
          price_currency?: string
          price_updated_at?: string | null
          quote_source?: string | null
          reference_price?: number | null
          reference_set_on?: string | null
          scheme_code?: string | null
          symbol?: string | null
          target_buy_price?: number | null
          thesis?: string | null
          updated_at?: string
        }
        Update: {
          asset_class?: string
          created_at?: string
          id?: string
          instrument_type?: string | null
          isin?: string | null
          last_price?: number | null
          name?: string
          notes?: string | null
          price_currency?: string
          price_updated_at?: string | null
          quote_source?: string | null
          reference_price?: number | null
          reference_set_on?: string | null
          scheme_code?: string | null
          symbol?: string | null
          target_buy_price?: number | null
          thesis?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      capture_portfolio_snapshot: {
        Args: never
        Returns: {
          snapshot_day: string
          snapshot_invested: number
          snapshot_total: number
        }[]
      }
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
