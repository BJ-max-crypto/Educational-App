export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          clerk_user_id: string | null;
          name: string | null;
          school: string | null;
          grade: string | null;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          clerk_user_id?: string | null;
          name?: string | null;
          school?: string | null;
          grade?: string | null;
          onboarding_completed_at?: string | null;
        };
        Update: {
          clerk_user_id?: string | null;
          name?: string | null;
          school?: string | null;
          grade?: string | null;
          onboarding_completed_at?: string | null;
        };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          teacher: string | null;
          color: string;
          is_unsorted: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          teacher?: string | null;
          color: string;
          is_unsorted?: boolean;
        };
        Update: {
          name?: string;
          teacher?: string | null;
          color?: string;
          is_unsorted?: boolean;
        };
        Relationships: [];
      };
      assignments: {
        Row: {
          id: string;
          user_id: string;
          course_id: string;
          external_uid: string;
          title: string;
          description: string | null;
          due_at: string | null;
          url: string | null;
          status: "not_started" | "in_progress" | "done";
          status_source: "manual" | "inferred";
          course_source: "inferred" | "manual" | "unsorted";
          last_seen_in_feed_at: string | null;
          missing_from_feed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          course_id: string;
          external_uid: string;
          title: string;
          description?: string | null;
          due_at?: string | null;
          url?: string | null;
          status?: "not_started" | "in_progress" | "done";
          status_source?: "manual" | "inferred";
          course_source?: "inferred" | "manual" | "unsorted";
          last_seen_in_feed_at?: string | null;
          missing_from_feed?: boolean;
        };
        Update: {
          title?: string;
          description?: string | null;
          due_at?: string | null;
          url?: string | null;
          status?: "not_started" | "in_progress" | "done";
          status_source?: "manual" | "inferred";
          course_source?: "inferred" | "manual" | "unsorted";
          last_seen_in_feed_at?: string | null;
          missing_from_feed?: boolean;
          course_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      feeds: {
        Row: {
          id: string;
          user_id: string;
          ical_url_encrypted: string | null;
          last_synced_at: string | null;
          status: "pending" | "ok" | "error";
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ical_url_encrypted?: string | null;
          last_synced_at?: string | null;
          status?: "pending" | "ok" | "error";
          last_error?: string | null;
        };
        Update: {
          updated_at?: string;
          ical_url_encrypted?: string | null;
          last_synced_at?: string | null;
          status?: "pending" | "ok" | "error";
          last_error?: string | null;
        };
        Relationships: [];
      };
      weekly_summaries: {
        Row: {
          user_id: string;
          summary: string;
          for_date: string;
          time_zone: string;
          used_calendar: boolean;
          model: string;
          generated_at: string;
        };
        Insert: {
          user_id: string;
          summary: string;
          for_date: string;
          time_zone: string;
          used_calendar?: boolean;
          model: string;
          generated_at?: string;
        };
        Update: {
          summary?: string;
          for_date?: string;
          time_zone?: string;
          used_calendar?: boolean;
          model?: string;
          generated_at?: string;
        };
        Relationships: [];
      };
      calendar_busy: {
        Row: {
          user_id: string;
          provider: string;
          busy: { start: string; end: string }[];
          range_start: string | null;
          range_end: string | null;
          fetched_at: string | null;
          last_error: string | null;
        };
        Insert: {
          user_id: string;
          provider?: string;
          busy?: { start: string; end: string }[];
          range_start?: string | null;
          range_end?: string | null;
          fetched_at?: string | null;
          last_error?: string | null;
        };
        Update: {
          busy?: { start: string; end: string }[];
          range_start?: string | null;
          range_end?: string | null;
          fetched_at?: string | null;
          last_error?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
