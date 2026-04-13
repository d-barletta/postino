export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      blog_articles: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          language: string;
          published: boolean;
          slug: string;
          tags: string[] | null;
          thumbnail_url: string | null;
          title: string;
          translation_group_id: string | null;
          updated_at: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          id?: string;
          language?: string;
          published?: boolean;
          slug: string;
          tags?: string[] | null;
          thumbnail_url?: string | null;
          title: string;
          translation_group_id?: string | null;
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          language?: string;
          published?: boolean;
          slug?: string;
          tags?: string[] | null;
          thumbnail_url?: string | null;
          title?: string;
          translation_group_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      email_jobs: {
        Row: {
          attempts: number;
          completed_at: string | null;
          created_at: string;
          id: string;
          last_error: string | null;
          lock_until: string | null;
          locked_by: string | null;
          max_attempts: number;
          not_before: string | null;
          payload: Json;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          id: string;
          last_error?: string | null;
          lock_until?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          not_before?: string | null;
          payload: Json;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          lock_until?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          not_before?: string | null;
          payload?: Json;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      email_logs: {
        Row: {
          agent_trace: Json | null;
          attachment_count: number | null;
          attachment_names: string[] | null;
          attachments: Json | null;
          bcc_address: string | null;
          cc_address: string | null;
          email_analysis: Json | null;
          error_message: string | null;
          estimated_cost: number | null;
          estimated_credits: number | null;
          from_address: string;
          id: string;
          message_id: string | null;
          original_body: string | null;
          processed_at: string | null;
          processed_body: string | null;
          processing_started_at: string | null;
          received_at: string | null;
          rule_applied: string | null;
          status: string;
          subject: string | null;
          to_address: string;
          tokens_used: number | null;
          user_id: string;
        };
        Insert: {
          agent_trace?: Json | null;
          attachment_count?: number | null;
          attachment_names?: string[] | null;
          attachments?: Json | null;
          bcc_address?: string | null;
          cc_address?: string | null;
          email_analysis?: Json | null;
          error_message?: string | null;
          estimated_cost?: number | null;
          estimated_credits?: number | null;
          from_address: string;
          id: string;
          message_id?: string | null;
          original_body?: string | null;
          processed_at?: string | null;
          processed_body?: string | null;
          processing_started_at?: string | null;
          received_at?: string | null;
          rule_applied?: string | null;
          status?: string;
          subject?: string | null;
          to_address: string;
          tokens_used?: number | null;
          user_id: string;
        };
        Update: {
          agent_trace?: Json | null;
          attachment_count?: number | null;
          attachment_names?: string[] | null;
          attachments?: Json | null;
          bcc_address?: string | null;
          cc_address?: string | null;
          email_analysis?: Json | null;
          error_message?: string | null;
          estimated_cost?: number | null;
          estimated_credits?: number | null;
          from_address?: string;
          id?: string;
          message_id?: string | null;
          original_body?: string | null;
          processed_at?: string | null;
          processed_body?: string | null;
          processing_started_at?: string | null;
          received_at?: string | null;
          rule_applied?: string | null;
          status?: string;
          subject?: string | null;
          to_address?: string;
          tokens_used?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'email_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      entity_flows: {
        Row: {
          data: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          data?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          data?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entity_flows_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      entity_merge_suggestions: {
        Row: {
          aliases: string[];
          category: string;
          created_at: string;
          id: string;
          reason: string;
          status: string;
          suggested_canonical: string;
          user_id: string;
        };
        Insert: {
          aliases: string[];
          category: string;
          created_at?: string;
          id?: string;
          reason: string;
          status?: string;
          suggested_canonical: string;
          user_id: string;
        };
        Update: {
          aliases?: string[];
          category?: string;
          created_at?: string;
          id?: string;
          reason?: string;
          status?: string;
          suggested_canonical?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entity_merge_suggestions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      entity_merges: {
        Row: {
          aliases: string[];
          canonical: string;
          category: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          aliases: string[];
          canonical: string;
          category: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          aliases?: string[];
          canonical?: string;
          category?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entity_merges_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      entity_place_maps: {
        Row: {
          data: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          data?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          data?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entity_place_maps_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      entity_relations: {
        Row: {
          data: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          data?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          data?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entity_relations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      mailgun_webhook_logs: {
        Row: {
          files: Json | null;
          id: string;
          linked: Json | null;
          preview_fields: Json | null;
          raw_fields: Json | null;
          reason: string | null;
          received_at: string;
          result: string | null;
          status: string;
          updated_at: string | null;
        };
        Insert: {
          files?: Json | null;
          id?: string;
          linked?: Json | null;
          preview_fields?: Json | null;
          raw_fields?: Json | null;
          reason?: string | null;
          received_at?: string;
          result?: string | null;
          status?: string;
          updated_at?: string | null;
        };
        Update: {
          files?: Json | null;
          id?: string;
          linked?: Json | null;
          preview_fields?: Json | null;
          raw_fields?: Json | null;
          reason?: string | null;
          received_at?: string;
          result?: string | null;
          status?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      mailgun_webhook_nonces: {
        Row: {
          created_at: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
        };
        Relationships: [];
      };
      place_geocodes: {
        Row: {
          created_at: string;
          display_name: string | null;
          key: string;
          latitude: number;
          longitude: number;
          name: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          key: string;
          latitude: number;
          longitude: number;
          name: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          key?: string;
          latitude?: number;
          longitude?: number;
          name?: string;
        };
        Relationships: [];
      };
      rules: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          match_body: string | null;
          match_sender: string | null;
          match_subject: string | null;
          name: string;
          sort_order: number | null;
          text: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          match_body?: string | null;
          match_sender?: string | null;
          match_subject?: string | null;
          name: string;
          sort_order?: number | null;
          text: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          match_body?: string | null;
          match_sender?: string | null;
          match_subject?: string | null;
          name?: string;
          sort_order?: number | null;
          text?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rules_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      settings: {
        Row: {
          data: Json;
          id: string;
          updated_at: string | null;
        };
        Insert: {
          data?: Json;
          id?: string;
          updated_at?: string | null;
        };
        Update: {
          data?: Json;
          id?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      user_memory: {
        Row: {
          entries: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          entries?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          entries?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_memory_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          analysis_output_language: string;
          assigned_email: string;
          credits_threshold_notified: boolean;
          credits_usage_month: string;
          created_at: string;
          display_name: string | null;
          email: string;
          id: string;
          is_active: boolean;
          is_address_enabled: boolean;
          is_admin: boolean;
          is_ai_analysis_only_enabled: boolean;
          is_forwarding_header_enabled: boolean;
          memory_estimated_cost: number;
          memory_tokens_used: number;
          monthly_credits_bonus: number;
          monthly_credits_used: number;
          suspended: boolean;
        };
        Insert: {
          analysis_output_language?: string;
          assigned_email: string;
          credits_threshold_notified?: boolean;
          credits_usage_month?: string;
          created_at?: string;
          display_name?: string | null;
          email: string;
          id: string;
          is_active?: boolean;
          is_address_enabled?: boolean;
          is_admin?: boolean;
          is_ai_analysis_only_enabled?: boolean;
          is_forwarding_header_enabled?: boolean;
          memory_estimated_cost?: number;
          memory_tokens_used?: number;
          monthly_credits_bonus?: number;
          monthly_credits_used?: number;
          suspended?: boolean;
        };
        Update: {
          analysis_output_language?: string;
          assigned_email?: string;
          credits_threshold_notified?: boolean;
          credits_usage_month?: string;
          created_at?: string;
          display_name?: string | null;
          email?: string;
          id?: string;
          is_active?: boolean;
          is_address_enabled?: boolean;
          is_admin?: boolean;
          is_ai_analysis_only_enabled?: boolean;
          is_forwarding_header_enabled?: boolean;
          memory_estimated_cost?: number;
          memory_tokens_used?: number;
          monthly_credits_bonus?: number;
          monthly_credits_used?: number;
          suspended?: boolean;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_email_job: {
        Args: {
          p_job_id: string;
          p_lease_end: string;
          p_now: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      get_email_stats_aggregate: {
        Args: { from_date?: string | null };
        Returns: { total_tokens: number; total_cost: number }[];
      };
      get_memory_stats_aggregate: {
        Args: Record<string, never>;
        Returns: { total_memory_tokens: number; total_memory_cost: number }[];
      };
      get_user_email_stats_aggregate: {
        Args: { p_user_id: string; from_date?: string | null };
        Returns: { total_tokens: number; total_cost: number }[];
      };
      remove_entity_fields_from_analysis: {
        Args: { log_ids: string[] };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
