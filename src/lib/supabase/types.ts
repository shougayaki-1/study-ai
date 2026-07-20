export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      analysis_runs: {
        Row: {
          completed_at: string | null
          engine: string
          id: string
          model: string
          started_at: string
          status: string
          summary_json: Json | null
        }
        Insert: {
          completed_at?: string | null
          engine: string
          id?: string
          model: string
          started_at?: string
          status?: string
          summary_json?: Json | null
        }
        Update: {
          completed_at?: string | null
          engine?: string
          id?: string
          model?: string
          started_at?: string
          status?: string
          summary_json?: Json | null
        }
        Relationships: []
      }
      common_test_unit_map: {
        Row: {
          confidence: number
          created_at: string
          exam_year: number | null
          id: string
          section: string
          source_note: string | null
          subject_id: string
          unit_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          exam_year?: number | null
          id?: string
          section: string
          source_note?: string | null
          subject_id: string
          unit_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          exam_year?: number | null
          id?: string
          section?: string
          source_note?: string | null
          subject_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "common_test_unit_map_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "common_test_unit_map_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      essay_reviews: {
        Row: {
          created_at: string
          id: string
          logic_comment: string | null
          overall: string | null
          photo_id: string
          structure_comment: string | null
          vocab_comment: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          logic_comment?: string | null
          overall?: string | null
          photo_id: string
          structure_comment?: string | null
          vocab_comment?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          logic_comment?: string | null
          overall?: string | null
          photo_id?: string
          structure_comment?: string | null
          vocab_comment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "essay_reviews_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      event_subjects: {
        Row: {
          event_id: string
          subject_id: string
        }
        Insert: {
          event_id: string
          subject_id: string
        }
        Update: {
          event_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_subjects_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      event_units: {
        Row: {
          event_id: string
          unit_id: string
        }
        Insert: {
          event_id: string
          unit_id: string
        }
        Update: {
          event_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_units_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          done: boolean
          due_date: string
          id: string
          kind: string
          title: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          due_date: string
          id?: string
          kind: string
          title: string
        }
        Update: {
          created_at?: string
          done?: boolean
          due_date?: string
          id?: string
          kind?: string
          title?: string
        }
        Relationships: []
      }
      knowledge_columns: {
        Row: {
          analysis_run_id: string | null
          body_md: string
          created_at: string
          id: string
          read_at: string | null
          subject_id: string
          title: string
          topic_tag: string | null
          trigger_reason: string | null
          unit_id: string | null
          weakness_score_at_generation: number | null
        }
        Insert: {
          analysis_run_id?: string | null
          body_md: string
          created_at?: string
          id?: string
          read_at?: string | null
          subject_id: string
          title: string
          topic_tag?: string | null
          trigger_reason?: string | null
          unit_id?: string | null
          weakness_score_at_generation?: number | null
        }
        Update: {
          analysis_run_id?: string | null
          body_md?: string
          created_at?: string
          id?: string
          read_at?: string | null
          subject_id?: string
          title?: string
          topic_tag?: string | null
          trigger_reason?: string | null
          unit_id?: string | null
          weakness_score_at_generation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_columns_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_columns_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_columns_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      material_units: {
        Row: {
          material_id: string
          unit_id: string
        }
        Insert: {
          material_id: string
          unit_id: string
        }
        Update: {
          material_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_units_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string
          difficulty: string
          id: string
          kind: string
          name: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: string
          id?: string
          kind: string
          name: string
          subject_id: string
        }
        Update: {
          created_at?: string
          difficulty?: string
          id?: string
          kind?: string
          name?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_exam_scores: {
        Row: {
          created_at: string
          deviation_value: number | null
          id: string
          max_score: number | null
          mock_exam_id: string
          national_avg_score: number | null
          rank: number | null
          score: number | null
          score_rate: number | null
          source_ref: string | null
          subject_id: string
          total_test_takers: number | null
        }
        Insert: {
          created_at?: string
          deviation_value?: number | null
          id?: string
          max_score?: number | null
          mock_exam_id: string
          national_avg_score?: number | null
          rank?: number | null
          score?: number | null
          score_rate?: number | null
          source_ref?: string | null
          subject_id: string
          total_test_takers?: number | null
        }
        Update: {
          created_at?: string
          deviation_value?: number | null
          id?: string
          max_score?: number | null
          mock_exam_id?: string
          national_avg_score?: number | null
          rank?: number | null
          score?: number | null
          score_rate?: number | null
          source_ref?: string | null
          subject_id?: string
          total_test_takers?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mock_exam_scores_mock_exam_id_fkey"
            columns: ["mock_exam_id"]
            isOneToOne: false
            referencedRelation: "mock_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_exam_scores_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_exam_section_timings: {
        Row: {
          actual_seconds: number | null
          created_at: string
          id: string
          mock_exam_score_id: string
          section: string
          source_photo_id: string | null
          target_seconds: number | null
          updated_at: string
        }
        Insert: {
          actual_seconds?: number | null
          created_at?: string
          id?: string
          mock_exam_score_id: string
          section: string
          source_photo_id?: string | null
          target_seconds?: number | null
          updated_at?: string
        }
        Update: {
          actual_seconds?: number | null
          created_at?: string
          id?: string
          mock_exam_score_id?: string
          section?: string
          source_photo_id?: string | null
          target_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mock_exam_section_timings_mock_exam_score_id_fkey"
            columns: ["mock_exam_score_id"]
            isOneToOne: false
            referencedRelation: "mock_exam_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mock_exam_section_timings_source_photo_id_fkey"
            columns: ["source_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_exams: {
        Row: {
          created_at: string
          exam_title: string
          id: string
          judgments_json: Json | null
          photo_id: string | null
          provider: string
          source: string | null
          source_ref: string | null
          taken_date: string
          total_deviation: number | null
          total_score: number | null
        }
        Insert: {
          created_at?: string
          exam_title: string
          id?: string
          judgments_json?: Json | null
          photo_id?: string | null
          provider?: string
          source?: string | null
          source_ref?: string | null
          taken_date: string
          total_deviation?: number | null
          total_score?: number | null
        }
        Update: {
          created_at?: string
          exam_title?: string
          id?: string
          judgments_json?: Json | null
          photo_id?: string | null
          provider?: string
          source?: string | null
          source_ref?: string | null
          taken_date?: string
          total_deviation?: number | null
          total_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mock_exams_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          analyzed_at: string | null
          byte_size: number | null
          confidence: number | null
          created_at: string
          file_hash: string | null
          id: string
          kind: string
          mime_type: string | null
          needs_review: boolean
          original_name: string | null
          result_json: Json | null
          session_id: string | null
          status: string
          storage_path: string
        }
        Insert: {
          analyzed_at?: string | null
          byte_size?: number | null
          confidence?: number | null
          created_at?: string
          file_hash?: string | null
          id?: string
          kind: string
          mime_type?: string | null
          needs_review?: boolean
          original_name?: string | null
          result_json?: Json | null
          session_id?: string | null
          status?: string
          storage_path: string
        }
        Update: {
          analyzed_at?: string | null
          byte_size?: number | null
          confidence?: number | null
          created_at?: string
          file_hash?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          needs_review?: boolean
          original_name?: string | null
          result_json?: Json | null
          session_id?: string | null
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_blocks: {
        Row: {
          created_at: string
          end_time: string
          id: string
          linked_session_batch_id: string | null
          memo: string | null
          plan_date: string
          recurrence_rule: string | null
          source_plan_id: string | null
          start_time: string
          status: string
          subject_id: string | null
          unit_id: string | null
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          linked_session_batch_id?: string | null
          memo?: string | null
          plan_date: string
          recurrence_rule?: string | null
          source_plan_id?: string | null
          start_time: string
          status?: string
          subject_id?: string | null
          unit_id?: string | null
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          linked_session_batch_id?: string | null
          memo?: string | null
          plan_date?: string
          recurrence_rule?: string | null
          source_plan_id?: string | null
          start_time?: string
          status?: string
          subject_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_blocks_source_plan_id_fkey"
            columns: ["source_plan_id"]
            isOneToOne: false
            referencedRelation: "plan_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_blocks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_blocks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys_json: Json
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys_json: Json
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys_json?: Json
        }
        Relationships: []
      }
      question_results: {
        Row: {
          confidence: number | null
          corrected_at: string | null
          created_at: string
          error_type: string | null
          id: string
          is_correct: boolean | null
          mock_exam_id: string | null
          photo_id: string
          question_label: string | null
          raw_topic_tags: Json | null
          result_granularity: string
          score_rate: number | null
          source: string
          source_ref: string | null
          subject_id: string | null
          unit_id: string | null
        }
        Insert: {
          confidence?: number | null
          corrected_at?: string | null
          created_at?: string
          error_type?: string | null
          id?: string
          is_correct?: boolean | null
          mock_exam_id?: string | null
          photo_id: string
          question_label?: string | null
          raw_topic_tags?: Json | null
          result_granularity?: string
          score_rate?: number | null
          source?: string
          source_ref?: string | null
          subject_id?: string | null
          unit_id?: string | null
        }
        Update: {
          confidence?: number | null
          corrected_at?: string | null
          created_at?: string
          error_type?: string | null
          id?: string
          is_correct?: boolean | null
          mock_exam_id?: string | null
          photo_id?: string
          question_label?: string | null
          raw_topic_tags?: Json | null
          result_granularity?: string
          score_rate?: number | null
          source?: string
          source_ref?: string | null
          subject_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_results_mock_exam_id_fkey"
            columns: ["mock_exam_id"]
            isOneToOne: false
            referencedRelation: "mock_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_results_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_results_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_results_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          analysis_run_id: string | null
          body_md: string
          created_at: string
          id: string
          kind: string
        }
        Insert: {
          analysis_run_id?: string | null
          body_md: string
          created_at?: string
          id?: string
          kind: string
        }
        Update: {
          analysis_run_id?: string | null
          body_md?: string
          created_at?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      review_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          done: boolean
          due_date: string
          estimated_minutes: number | null
          evidence_json: Json | null
          id: string
          material_id: string | null
          priority_score: number | null
          range_text: string | null
          reason: string | null
          source_kind: string | null
          status: string
          subject_id: string | null
          unit_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          done?: boolean
          due_date?: string
          estimated_minutes?: number | null
          evidence_json?: Json | null
          id?: string
          material_id?: string | null
          priority_score?: number | null
          range_text?: string | null
          reason?: string | null
          source_kind?: string | null
          status?: string
          subject_id?: string | null
          unit_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          done?: boolean
          due_date?: string
          estimated_minutes?: number | null
          evidence_json?: Json | null
          id?: string
          material_id?: string | null
          priority_score?: number | null
          range_text?: string | null
          reason?: string | null
          source_kind?: string | null
          status?: string
          subject_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_tasks_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_tasks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_tasks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          batch_id: string | null
          common_test_section: string | null
          common_test_year: number | null
          created_at: string
          id: string
          material_id: string | null
          memo: string | null
          minutes: number
          range_text: string | null
          record_type: string
          started_at: string
          study_date: string
          subject_id: string
          topic_tag: string | null
          understanding: string | null
          unit_id: string | null
        }
        Insert: {
          batch_id?: string | null
          common_test_section?: string | null
          common_test_year?: number | null
          created_at?: string
          id?: string
          material_id?: string | null
          memo?: string | null
          minutes: number
          range_text?: string | null
          record_type?: string
          started_at?: string
          study_date?: string
          subject_id: string
          topic_tag?: string | null
          understanding?: string | null
          unit_id?: string | null
        }
        Update: {
          batch_id?: string | null
          common_test_section?: string | null
          common_test_year?: number | null
          created_at?: string
          id?: string
          material_id?: string | null
          memo?: string | null
          minutes?: number
          range_text?: string | null
          record_type?: string
          started_at?: string
          study_date?: string
          subject_id?: string
          topic_tag?: string | null
          understanding?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          color: string
          columns_enabled: boolean
          created_at: string
          id: string
          input_profile: string
          is_target: boolean
          name: string
          sort_order: number
        }
        Insert: {
          color?: string
          columns_enabled?: boolean
          created_at?: string
          id?: string
          input_profile?: string
          is_target?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          color?: string
          columns_enabled?: boolean
          created_at?: string
          id?: string
          input_profile?: string
          is_target?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      topic_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          subject_id: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          subject_id: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          subject_id?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "topic_tags_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_state_snapshots: {
        Row: {
          accuracy: number | null
          created_at: string
          evidence_json: Json | null
          id: string
          last_studied_at: string | null
          next_review_date: string | null
          review_count: number
          snapshot_date: string
          stability_days: number | null
          state: string
          understanding: string | null
          unit_id: string
          weakness_score: number
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          evidence_json?: Json | null
          id?: string
          last_studied_at?: string | null
          next_review_date?: string | null
          review_count?: number
          snapshot_date?: string
          stability_days?: number | null
          state: string
          understanding?: string | null
          unit_id: string
          weakness_score?: number
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          evidence_json?: Json | null
          id?: string
          last_studied_at?: string | null
          next_review_date?: string | null
          review_count?: number
          snapshot_date?: string
          stability_days?: number | null
          state?: string
          understanding?: string | null
          unit_id?: string
          weakness_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "unit_state_snapshots_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          created_at: string
          id: string
          is_target: boolean
          name: string
          sort_order: number
          subject_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_target?: boolean
          name: string
          sort_order?: number
          subject_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_target?: boolean
          name?: string
          sort_order?: number
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      weakness_scores: {
        Row: {
          accuracy: number | null
          computed_at: string
          id: string
          last_studied_at: string | null
          score: number
          unit_id: string
        }
        Insert: {
          accuracy?: number | null
          computed_at?: string
          id?: string
          last_studied_at?: string | null
          score?: number
          unit_id: string
        }
        Update: {
          accuracy?: number | null
          computed_at?: string
          id?: string
          last_studied_at?: string | null
          score?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weakness_scores_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plans: {
        Row: {
          adjusted_minutes: number | null
          created_at: string
          estimated_minutes: number
          focus_json: Json | null
          id: string
          updated_at: string
          week_start: string
        }
        Insert: {
          adjusted_minutes?: number | null
          created_at?: string
          estimated_minutes: number
          focus_json?: Json | null
          id?: string
          updated_at?: string
          week_start: string
        }
        Update: {
          adjusted_minutes?: number | null
          created_at?: string
          estimated_minutes?: number
          focus_json?: Json | null
          id?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_recurring_plan: {
        Args: {
          p_end_time: string
          p_memo: string
          p_plan_date: string
          p_start_time: string
          p_subject_id: string
          p_unit_id: string
          p_weekdays: string[]
          p_weeks: number
        }
        Returns: string
      }
      create_study_session_batch: {
        Args: { p_plan_block_id: string; p_sessions: Json; p_topic_tags: Json }
        Returns: string
      }
      replace_material_units: {
        Args: { p_material_id: string; p_unit_ids: string[] }
        Returns: undefined
      }
      save_event_with_links: {
        Args: {
          p_due_date: string
          p_event_id: string
          p_kind: string
          p_subject_id: string
          p_title: string
          p_unit_id: string
        }
        Returns: string
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
