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
          school_location: string | null;
          username: string | null;
          invite_code: string | null;
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
          school_location?: string | null;
          username?: string | null;
          invite_code?: string | null;
          onboarding_completed_at?: string | null;
        };
        Update: {
          clerk_user_id?: string | null;
          name?: string | null;
          school?: string | null;
          grade?: string | null;
          school_location?: string | null;
          username?: string | null;
          invite_code?: string | null;
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
          school_course_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          teacher?: string | null;
          color: string;
          is_unsorted?: boolean;
          school_course_id?: string | null;
        };
        Update: {
          name?: string;
          teacher?: string | null;
          color?: string;
          is_unsorted?: boolean;
          school_course_id?: string | null;
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
          used_schedule: boolean;
          model: string;
          generated_at: string;
        };
        Insert: {
          user_id: string;
          summary: string;
          for_date: string;
          time_zone: string;
          used_calendar?: boolean;
          used_schedule?: boolean;
          model: string;
          generated_at?: string;
        };
        Update: {
          summary?: string;
          for_date?: string;
          time_zone?: string;
          used_calendar?: boolean;
          used_schedule?: boolean;
          model?: string;
          generated_at?: string;
        };
        Relationships: [];
      };
      assignment_course_overrides: {
        Row: {
          user_id: string;
          schoology_uid: string;
          course_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          schoology_uid: string;
          course_id: string;
          updated_at?: string;
        };
        Update: {
          course_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      connections: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: "pending" | "accepted";
          requester_classes: string[];
          addressee_classes: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          addressee_id: string;
          status?: "pending" | "accepted";
          requester_classes?: string[];
          addressee_classes?: string[];
          updated_at?: string;
        };
        Update: {
          status?: "pending" | "accepted";
          requester_classes?: string[];
          addressee_classes?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      school_courses: {
        Row: {
          id: string;
          school_name: string;
          name: string;
          teacher: string;
          period: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_name: string;
          name: string;
          teacher?: string;
          period?: string | null;
          created_by?: string | null;
        };
        Update: {
          school_name?: string;
          name?: string;
          teacher?: string;
          period?: string | null;
        };
        Relationships: [];
      };
      user_courses: {
        Row: { user_id: string; school_course_id: string; created_at: string };
        Insert: { user_id: string; school_course_id: string };
        Update: { user_id?: string; school_course_id?: string };
        Relationships: [];
      };
      school_classes: {
        Row: {
          id: string;
          school_key: string;
          location_key: string;
          name: string;
          name_key: string;
          color: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_key: string;
          location_key?: string;
          name: string;
          name_key: string;
          color: string;
          created_by: string;
        };
        Update: {
          name?: string;
          color?: string;
        };
        Relationships: [];
      };
      school_class_items: {
        Row: {
          school_class_id: string;
          external_uid: string;
          title: string;
          description: string | null;
          due_at: string | null;
          url: string | null;
          updated_at: string;
        };
        Insert: {
          school_class_id: string;
          external_uid: string;
          title: string;
          description?: string | null;
          due_at?: string | null;
          url?: string | null;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          due_at?: string | null;
          url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      school_class_members: {
        Row: { school_class_id: string; profile_id: string };
        Insert: { school_class_id: string; profile_id: string };
        Update: { school_class_id?: string; profile_id?: string };
        Relationships: [];
      };
      schedule_photos: {
        Row: { user_id: string; content_type: string; data: string; updated_at: string };
        Insert: { user_id: string; content_type: string; data: string; updated_at?: string };
        Update: { content_type?: string; data?: string; updated_at?: string };
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
