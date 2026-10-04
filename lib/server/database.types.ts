// Generated from Stratum public schema with supabase gen types.
// Regenerate after applying schema changes; do not hand-edit.
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
      agent_jobs: {
        Row: {
          attempts: number
          blocked_on: Json | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          payload: Json
          priority: number
          run_after: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          blocked_on?: Json | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          job_type: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          run_after?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          blocked_on?: Json | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          run_after?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          input_refs: Json
          job_id: string
          model: string | null
          output: Json | null
          provider: string | null
          started_at: string
          status: string
          worker_id: string
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input_refs?: Json
          job_id: string
          model?: string | null
          output?: Json | null
          provider?: string | null
          started_at?: string
          status: string
          worker_id: string
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input_refs?: Json
          job_id?: string
          model?: string | null
          output?: Json | null
          provider?: string | null
          started_at?: string
          status?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      article_summaries: {
        Row: {
          created_at: string
          summary: string
          title: string | null
          url: string
          url_hash: string
        }
        Insert: {
          created_at?: string
          summary: string
          title?: string | null
          url: string
          url_hash: string
        }
        Update: {
          created_at?: string
          summary?: string
          title?: string | null
          url?: string
          url_hash?: string
        }
        Relationships: []
      }
      biotech_clinical_catalyst_sources: {
        Row: {
          catalyst_fingerprint: string
          created_at: string
          document_id: string | null
          feed_item_id: string | null
          fetched_at: string
          published_at: string | null
          publisher: string
          source_family: string
          source_id: string
          source_lane: string
          source_time_anomaly: boolean
          title: string
          url: string
        }
        Insert: {
          catalyst_fingerprint: string
          created_at?: string
          document_id?: string | null
          feed_item_id?: string | null
          fetched_at: string
          published_at?: string | null
          publisher: string
          source_family: string
          source_id: string
          source_lane: string
          source_time_anomaly?: boolean
          title: string
          url: string
        }
        Update: {
          catalyst_fingerprint?: string
          created_at?: string
          document_id?: string | null
          feed_item_id?: string | null
          fetched_at?: string
          published_at?: string | null
          publisher?: string
          source_family?: string
          source_id?: string
          source_lane?: string
          source_time_anomaly?: boolean
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "biotech_clinical_catalyst_sources_catalyst_fingerprint_fkey"
            columns: ["catalyst_fingerprint"]
            isOneToOne: false
            referencedRelation: "biotech_clinical_catalysts"
            referencedColumns: ["fingerprint"]
          },
        ]
      }
      biotech_clinical_catalysts: {
        Row: {
          created_at: string
          decisive_new_event: boolean
          economic_channels: Json
          event_cluster_ids: Json
          fingerprint: string
          first_observed_at: string
          indication: string | null
          kind: string
          last_observed_at: string
          materiality: number
          next_review_at: string
          outcome: string
          phase: string | null
          significance: string
          source_ids: Json
          status: string
          symbols: Json
          therapy: string | null
          time_sensitivity: number
          title: string
          trial_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decisive_new_event?: boolean
          economic_channels?: Json
          event_cluster_ids?: Json
          fingerprint: string
          first_observed_at: string
          indication?: string | null
          kind: string
          last_observed_at: string
          materiality: number
          next_review_at: string
          outcome: string
          phase?: string | null
          significance: string
          source_ids?: Json
          status?: string
          symbols?: Json
          therapy?: string | null
          time_sensitivity: number
          title: string
          trial_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decisive_new_event?: boolean
          economic_channels?: Json
          event_cluster_ids?: Json
          fingerprint?: string
          first_observed_at?: string
          indication?: string | null
          kind?: string
          last_observed_at?: string
          materiality?: number
          next_review_at?: string
          outcome?: string
          phase?: string | null
          significance?: string
          source_ids?: Json
          status?: string
          symbols?: Json
          therapy?: string | null
          time_sensitivity?: number
          title?: string
          trial_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      brokerage_account_snapshots: {
        Row: {
          buying_power: number | null
          cash_balance: number
          created_at: string
          currency: string
          equity_value: number
          sync_run_id: string
          total_value: number
        }
        Insert: {
          buying_power?: number | null
          cash_balance: number
          created_at?: string
          currency?: string
          equity_value: number
          sync_run_id: string
          total_value: number
        }
        Update: {
          buying_power?: number | null
          cash_balance?: number
          created_at?: string
          currency?: string
          equity_value?: number
          sync_run_id?: string
          total_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "brokerage_account_snapshots_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: true
            referencedRelation: "brokerage_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      brokerage_position_snapshots: {
        Row: {
          cost_basis_per_share: number
          created_at: string
          current_price: number | null
          quantity: number
          quote_as_of: string | null
          quote_source: string
          symbol: string
          sync_run_id: string
        }
        Insert: {
          cost_basis_per_share: number
          created_at?: string
          current_price?: number | null
          quantity: number
          quote_as_of?: string | null
          quote_source?: string
          symbol: string
          sync_run_id: string
        }
        Update: {
          cost_basis_per_share?: number
          created_at?: string
          current_price?: number | null
          quantity?: number
          quote_as_of?: string | null
          quote_source?: string
          symbol?: string
          sync_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brokerage_position_snapshots_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "brokerage_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      brokerage_sync_runs: {
        Row: {
          account_last4: string
          captured_at: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          owner_id: string
          portfolio_id: string
          position_count: number
          provider: string
          slot: string | null
          source_metadata: Json
          status: string
        }
        Insert: {
          account_last4: string
          captured_at?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          owner_id: string
          portfolio_id: string
          position_count?: number
          provider: string
          slot?: string | null
          source_metadata?: Json
          status?: string
        }
        Update: {
          account_last4?: string
          captured_at?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          owner_id?: string
          portfolio_id?: string
          position_count?: number
          provider?: string
          slot?: string | null
          source_metadata?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "brokerage_sync_runs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brokerage_sync_runs_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_briefs: {
        Row: {
          company: string
          content: Json
          created_at: string
          generated_at: string
          id: string
          leadership_snapshot_id: string
          owner_id: string | null
          sector: string
          snoozed_until: string | null
          status: string
          sub_industry: string
          symbol: string
          trading_date: string
          why_surfaced: string
        }
        Insert: {
          company: string
          content: Json
          created_at?: string
          generated_at: string
          id: string
          leadership_snapshot_id: string
          owner_id?: string | null
          sector: string
          snoozed_until?: string | null
          status?: string
          sub_industry: string
          symbol: string
          trading_date: string
          why_surfaced: string
        }
        Update: {
          company?: string
          content?: Json
          created_at?: string
          generated_at?: string
          id?: string
          leadership_snapshot_id?: string
          owner_id?: string | null
          sector?: string
          snoozed_until?: string | null
          status?: string
          sub_industry?: string
          symbol?: string
          trading_date?: string
          why_surfaced?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_briefs_leadership_snapshot_id_fkey"
            columns: ["leadership_snapshot_id"]
            isOneToOne: false
            referencedRelation: "market_leadership_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_briefs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_briefs_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      candidate_signals: {
        Row: {
          candidate_id: string
          kind: string
          material_key: string
          summary: string
        }
        Insert: {
          candidate_id: string
          kind: string
          material_key: string
          summary: string
        }
        Update: {
          candidate_id?: string
          kind?: string
          material_key?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_signals_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_weekly_summaries: {
        Row: {
          candidate_count: number
          content: Json
          generated_at: string
          period_start: string
          week_ending: string
        }
        Insert: {
          candidate_count: number
          content: Json
          generated_at?: string
          period_start: string
          week_ending: string
        }
        Update: {
          candidate_count?: number
          content?: Json
          generated_at?: string
          period_start?: string
          week_ending?: string
        }
        Relationships: []
      }
      capital_decision_constraint_checks: {
        Row: {
          checks: Json
          data_as_of: string
          decision_id: string
          evaluated_at: string
          id: string
          inputs: Json | null
          owner_id: string
          portfolio_id: string
          status: string
        }
        Insert: {
          checks?: Json
          data_as_of: string
          decision_id: string
          evaluated_at?: string
          id?: string
          inputs?: Json | null
          owner_id: string
          portfolio_id: string
          status: string
        }
        Update: {
          checks?: Json
          data_as_of?: string
          decision_id?: string
          evaluated_at?: string
          id?: string
          inputs?: Json | null
          owner_id?: string
          portfolio_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "capital_decision_constraint_checks_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: true
            referencedRelation: "thesis_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_decision_constraint_checks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_decision_constraint_checks_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      causal_model_versions: {
        Row: {
          as_of: string
          causal_key: string
          confidence: number
          constrained_layer: string | null
          created_at: string
          economic_variable: string | null
          expectations_question: string | null
          freshness: Json
          id: string
          importance: number
          mechanism: string | null
          relationships: Json
          rent_recipient: string | null
          source_commit: string | null
          source_id: string
          source_ids: Json
          source_kind: string
          source_version: string
          state: string
          structured_content: Json
          summary: string
          title: string
        }
        Insert: {
          as_of: string
          causal_key: string
          confidence: number
          constrained_layer?: string | null
          created_at?: string
          economic_variable?: string | null
          expectations_question?: string | null
          freshness?: Json
          id?: string
          importance: number
          mechanism?: string | null
          relationships?: Json
          rent_recipient?: string | null
          source_commit?: string | null
          source_id: string
          source_ids?: Json
          source_kind: string
          source_version: string
          state: string
          structured_content?: Json
          summary: string
          title: string
        }
        Update: {
          as_of?: string
          causal_key?: string
          confidence?: number
          constrained_layer?: string | null
          created_at?: string
          economic_variable?: string | null
          expectations_question?: string | null
          freshness?: Json
          id?: string
          importance?: number
          mechanism?: string | null
          relationships?: Json
          rent_recipient?: string | null
          source_commit?: string | null
          source_id?: string
          source_ids?: Json
          source_kind?: string
          source_version?: string
          state?: string
          structured_content?: Json
          summary?: string
          title?: string
        }
        Relationships: []
      }
      company_market_models: {
        Row: {
          company_packet_id: string
          content: Json | null
          data_as_of: string
          error: string | null
          generated_at: string
          id: string
          model: string | null
          owner_id: string
          provider: string | null
          source_ids: Json
          status: string
          symbol: string
          version: number
        }
        Insert: {
          company_packet_id: string
          content?: Json | null
          data_as_of: string
          error?: string | null
          generated_at?: string
          id?: string
          model?: string | null
          owner_id: string
          provider?: string | null
          source_ids?: Json
          status?: string
          symbol: string
          version: number
        }
        Update: {
          company_packet_id?: string
          content?: Json | null
          data_as_of?: string
          error?: string | null
          generated_at?: string
          id?: string
          model?: string | null
          owner_id?: string
          provider?: string | null
          source_ids?: Json
          status?: string
          symbol?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_market_models_company_packet_id_fkey"
            columns: ["company_packet_id"]
            isOneToOne: false
            referencedRelation: "company_packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_market_models_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_market_models_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      company_packets: {
        Row: {
          data_as_of: string
          error: string | null
          generated_at: string
          id: string
          owner_id: string | null
          packet: Json
          source_ids: Json
          status: string
          symbol: string
          version: number
        }
        Insert: {
          data_as_of: string
          error?: string | null
          generated_at?: string
          id?: string
          owner_id?: string | null
          packet: Json
          source_ids?: Json
          status?: string
          symbol: string
          version: number
        }
        Update: {
          data_as_of?: string
          error?: string | null
          generated_at?: string
          id?: string
          owner_id?: string | null
          packet?: Json
          source_ids?: Json
          status?: string
          symbol?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_packets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_packets_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      company_research_search_index: {
        Row: {
          data_as_of: string
          generated_at: string
          indexed_at: string
          owner_id: string
          report_id: string
          search_text: string
          search_vector: unknown
          symbol: string
          version: number
        }
        Insert: {
          data_as_of: string
          generated_at: string
          indexed_at?: string
          owner_id: string
          report_id: string
          search_text: string
          search_vector?: unknown
          symbol: string
          version: number
        }
        Update: {
          data_as_of?: string
          generated_at?: string
          indexed_at?: string
          owner_id?: string
          report_id?: string
          search_text?: string
          search_vector?: unknown
          symbol?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_research_search_index_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "equity_research_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      company_world_memory_receipts: {
        Row: {
          affected_claim_ids: Json
          affected_node_ids: Json
          attempts: number
          context_node_ids: Json
          created_at: string
          evidence_gaps: Json
          explanation: string | null
          finished_at: string | null
          job_id: string | null
          origin: string
          originating_lead_id: string | null
          owner_id: string
          report_id: string
          result_commit: string | null
          run_id: string | null
          started_at: string | null
          status: string
          symbol: string
          updated_at: string
        }
        Insert: {
          affected_claim_ids?: Json
          affected_node_ids?: Json
          attempts?: number
          context_node_ids?: Json
          created_at?: string
          evidence_gaps?: Json
          explanation?: string | null
          finished_at?: string | null
          job_id?: string | null
          origin: string
          originating_lead_id?: string | null
          owner_id: string
          report_id: string
          result_commit?: string | null
          run_id?: string | null
          started_at?: string | null
          status?: string
          symbol: string
          updated_at?: string
        }
        Update: {
          affected_claim_ids?: Json
          affected_node_ids?: Json
          attempts?: number
          context_node_ids?: Json
          created_at?: string
          evidence_gaps?: Json
          explanation?: string | null
          finished_at?: string | null
          job_id?: string | null
          origin?: string
          originating_lead_id?: string | null
          owner_id?: string
          report_id?: string
          result_commit?: string | null
          run_id?: string | null
          started_at?: string | null
          status?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_world_memory_receipts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_world_memory_receipts_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "equity_research_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_world_memory_receipts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "world_thinker_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_asset_observations: {
        Row: {
          change_percent: number | null
          created_at: string
          data_status: string
          feed_timestamp: string
          instrument_id: string
          instrument_type: string
          label: string
          previous_value: number | null
          retrieved_at: string
          snapshot_id: string
          source: string
          source_label: string
          source_url: string
          symbol: string
          unit: string
          value: number
        }
        Insert: {
          change_percent?: number | null
          created_at?: string
          data_status: string
          feed_timestamp: string
          instrument_id: string
          instrument_type: string
          label: string
          previous_value?: number | null
          retrieved_at: string
          snapshot_id: string
          source: string
          source_label: string
          source_url: string
          symbol: string
          unit: string
          value: number
        }
        Update: {
          change_percent?: number | null
          created_at?: string
          data_status?: string
          feed_timestamp?: string
          instrument_id?: string
          instrument_type?: string
          label?: string
          previous_value?: number | null
          retrieved_at?: string
          snapshot_id?: string
          source?: string
          source_label?: string
          source_url?: string
          symbol?: string
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "cross_asset_observations_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "cross_asset_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_asset_snapshots: {
        Row: {
          created_at: string
          data_as_of: string | null
          error: string | null
          id: string
          is_latest: boolean
          observation_count: number
          published_at: string | null
          retrieved_at: string
          status: string
        }
        Insert: {
          created_at?: string
          data_as_of?: string | null
          error?: string | null
          id?: string
          is_latest?: boolean
          observation_count?: number
          published_at?: string | null
          retrieved_at: string
          status?: string
        }
        Update: {
          created_at?: string
          data_as_of?: string | null
          error?: string | null
          id?: string
          is_latest?: boolean
          observation_count?: number
          published_at?: string | null
          retrieved_at?: string
          status?: string
        }
        Relationships: []
      }
      decision_inbox_items: {
        Row: {
          created_at: string
          dedupe_key: string
          entity_key: string | null
          evidence: Json
          id: string
          investment_thesis_id: string | null
          item_type: string
          occurred_at: string
          owner_id: string
          portfolio_id: string | null
          severity: string
          status: string
          summary: string
          symbol: string | null
          thesis_monitor_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          entity_key?: string | null
          evidence?: Json
          id?: string
          investment_thesis_id?: string | null
          item_type: string
          occurred_at: string
          owner_id: string
          portfolio_id?: string | null
          severity?: string
          status?: string
          summary: string
          symbol?: string | null
          thesis_monitor_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          entity_key?: string | null
          evidence?: Json
          id?: string
          investment_thesis_id?: string | null
          item_type?: string
          occurred_at?: string
          owner_id?: string
          portfolio_id?: string | null
          severity?: string
          status?: string
          summary?: string
          symbol?: string | null
          thesis_monitor_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_inbox_items_investment_thesis_id_fkey"
            columns: ["investment_thesis_id"]
            isOneToOne: false
            referencedRelation: "investment_theses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_inbox_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_inbox_items_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_inbox_items_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "decision_inbox_items_thesis_monitor_id_fkey"
            columns: ["thesis_monitor_id"]
            isOneToOne: false
            referencedRelation: "thesis_monitors"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_reviews: {
        Row: {
          decision_id: string
          expectation_assessment: string
          id: string
          lessons: string
          outcome: string
          owner_id: string
          postmortem: string
          reviewed_at: string
          symbol: string
        }
        Insert: {
          decision_id: string
          expectation_assessment?: string
          id?: string
          lessons?: string
          outcome: string
          owner_id: string
          postmortem?: string
          reviewed_at?: string
          symbol: string
        }
        Update: {
          decision_id?: string
          expectation_assessment?: string
          id?: string
          lessons?: string
          outcome?: string
          owner_id?: string
          postmortem?: string
          reviewed_at?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_reviews_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "thesis_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_reviews_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_reviews_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      equity_research_notes: {
        Row: {
          company_market_model_id: string | null
          company_packet_id: string
          content: Json | null
          data_as_of: string
          entry_action: string
          error: string | null
          formal_rating: string
          generated_at: string
          id: string
          model: string | null
          owner_id: string
          previous_research_note_id: string | null
          provider: string | null
          status: string
          symbol: string
          version: number
        }
        Insert: {
          company_market_model_id?: string | null
          company_packet_id: string
          content?: Json | null
          data_as_of: string
          entry_action?: string
          error?: string | null
          formal_rating?: string
          generated_at?: string
          id?: string
          model?: string | null
          owner_id: string
          previous_research_note_id?: string | null
          provider?: string | null
          status?: string
          symbol: string
          version: number
        }
        Update: {
          company_market_model_id?: string | null
          company_packet_id?: string
          content?: Json | null
          data_as_of?: string
          entry_action?: string
          error?: string | null
          formal_rating?: string
          generated_at?: string
          id?: string
          model?: string | null
          owner_id?: string
          previous_research_note_id?: string | null
          provider?: string | null
          status?: string
          symbol?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "equity_research_notes_company_market_model_id_fkey"
            columns: ["company_market_model_id"]
            isOneToOne: false
            referencedRelation: "company_market_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equity_research_notes_company_packet_id_fkey"
            columns: ["company_packet_id"]
            isOneToOne: false
            referencedRelation: "company_packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equity_research_notes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equity_research_notes_previous_research_note_id_fkey"
            columns: ["previous_research_note_id"]
            isOneToOne: false
            referencedRelation: "equity_research_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equity_research_notes_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      equity_research_sources: {
        Row: {
          label: string
          research_note_id: string
          source: string
          source_as_of: string
          source_id: string
          url: string
        }
        Insert: {
          label: string
          research_note_id: string
          source: string
          source_as_of: string
          source_id: string
          url: string
        }
        Update: {
          label?: string
          research_note_id?: string
          source?: string
          source_as_of?: string
          source_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "equity_research_sources_research_note_id_fkey"
            columns: ["research_note_id"]
            isOneToOne: false
            referencedRelation: "equity_research_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      etf_research_notes: {
        Row: {
          content: Json | null
          data_as_of: string
          entry_action: string
          error: string | null
          etf_research_packet_id: string
          formal_rating: string
          generated_at: string
          id: string
          model: string | null
          owner_id: string
          previous_research_note_id: string | null
          provider: string | null
          status: string
          symbol: string
          version: number
        }
        Insert: {
          content?: Json | null
          data_as_of: string
          entry_action?: string
          error?: string | null
          etf_research_packet_id: string
          formal_rating?: string
          generated_at?: string
          id?: string
          model?: string | null
          owner_id: string
          previous_research_note_id?: string | null
          provider?: string | null
          status?: string
          symbol: string
          version: number
        }
        Update: {
          content?: Json | null
          data_as_of?: string
          entry_action?: string
          error?: string | null
          etf_research_packet_id?: string
          formal_rating?: string
          generated_at?: string
          id?: string
          model?: string | null
          owner_id?: string
          previous_research_note_id?: string | null
          provider?: string | null
          status?: string
          symbol?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "etf_research_notes_etf_research_packet_id_fkey"
            columns: ["etf_research_packet_id"]
            isOneToOne: false
            referencedRelation: "etf_research_packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etf_research_notes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etf_research_notes_previous_research_note_id_fkey"
            columns: ["previous_research_note_id"]
            isOneToOne: false
            referencedRelation: "etf_research_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etf_research_notes_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      etf_research_packets: {
        Row: {
          data_as_of: string
          error: string | null
          generated_at: string
          id: string
          owner_id: string
          packet: Json
          source_ids: Json
          status: string
          symbol: string
          version: number
        }
        Insert: {
          data_as_of: string
          error?: string | null
          generated_at?: string
          id?: string
          owner_id: string
          packet: Json
          source_ids?: Json
          status?: string
          symbol: string
          version: number
        }
        Update: {
          data_as_of?: string
          error?: string | null
          generated_at?: string
          id?: string
          owner_id?: string
          packet?: Json
          source_ids?: Json
          status?: string
          symbol?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "etf_research_packets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etf_research_packets_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      etf_research_sources: {
        Row: {
          label: string
          research_note_id: string
          source: string
          source_as_of: string
          source_id: string
          url: string
        }
        Insert: {
          label: string
          research_note_id: string
          source: string
          source_as_of: string
          source_id: string
          url: string
        }
        Update: {
          label?: string
          research_note_id?: string
          source?: string
          source_as_of?: string
          source_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "etf_research_sources_research_note_id_fkey"
            columns: ["research_note_id"]
            isOneToOne: false
            referencedRelation: "etf_research_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_items: {
        Row: {
          fetched_at: string | null
          id: string
          item_type: string
          metadata: Json | null
          published_at: string | null
          scope: string
          section: string
          title: string
          url: string
        }
        Insert: {
          fetched_at?: string | null
          id?: string
          item_type: string
          metadata?: Json | null
          published_at?: string | null
          scope: string
          section: string
          title: string
          url: string
        }
        Update: {
          fetched_at?: string | null
          id?: string
          item_type?: string
          metadata?: Json | null
          published_at?: string | null
          scope?: string
          section?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      gnews_resolved_urls: {
        Row: {
          article_id: string
          resolved_at: string
          resolved_url: string
        }
        Insert: {
          article_id: string
          resolved_at?: string
          resolved_url: string
        }
        Update: {
          article_id?: string
          resolved_at?: string
          resolved_url?: string
        }
        Relationships: []
      }
      intelligence_generation_attempts: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          readiness: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata: Json
          readiness: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          readiness?: string
          type?: string
        }
        Relationships: []
      }
      investment_macro_vintages: {
        Row: {
          content: Json
          content_hash: string
          id: string
          observed_at: string
          series_id: string
        }
        Insert: {
          content: Json
          content_hash: string
          id?: string
          observed_at?: string
          series_id: string
        }
        Update: {
          content?: Json
          content_hash?: string
          id?: string
          observed_at?: string
          series_id?: string
        }
        Relationships: []
      }
      investment_newsletter_delivery: {
        Row: {
          attempts: number
          error: string | null
          first_attempt_at: string | null
          last_attempt_at: string | null
          lease_until: string | null
          outbox_id: string
          provider_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          error?: string | null
          first_attempt_at?: string | null
          last_attempt_at?: string | null
          lease_until?: string | null
          outbox_id: string
          provider_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          error?: string | null
          first_attempt_at?: string | null
          last_attempt_at?: string | null
          lease_until?: string | null
          outbox_id?: string
          provider_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_newsletter_delivery_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: true
            referencedRelation: "investment_newsletter_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_newsletter_events: {
        Row: {
          event_type: string
          id: string
          occurred_at: string
          outbox_id: string
          received_at: string
        }
        Insert: {
          event_type: string
          id: string
          occurred_at: string
          outbox_id: string
          received_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          occurred_at?: string
          outbox_id?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_newsletter_events_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "investment_newsletter_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_newsletter_outbox: {
        Row: {
          batch_id: string | null
          content_hash: string
          created_at: string
          delivery_provider: string
          edition_date: string
          html: string
          id: string
          owner_id: string
          plain_text: string
          recipient: string
          sender: string
          subject: string
        }
        Insert: {
          batch_id?: string | null
          content_hash: string
          created_at?: string
          delivery_provider?: string
          edition_date: string
          html: string
          id?: string
          owner_id: string
          plain_text: string
          recipient: string
          sender: string
          subject: string
        }
        Update: {
          batch_id?: string | null
          content_hash?: string
          created_at?: string
          delivery_provider?: string
          edition_date?: string
          html?: string
          id?: string
          owner_id?: string
          plain_text?: string
          recipient?: string
          sender?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_newsletter_outbox_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "recommendation_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_price_vintages: {
        Row: {
          adjustment: string
          content: Json
          content_hash: string
          feed: string
          id: string
          observed_at: string
          security_id: string
          session_date: string
          source_as_of: string
          symbol: string
        }
        Insert: {
          adjustment: string
          content: Json
          content_hash: string
          feed: string
          id?: string
          observed_at?: string
          security_id: string
          session_date: string
          source_as_of: string
          symbol: string
        }
        Update: {
          adjustment?: string
          content?: Json
          content_hash?: string
          feed?: string
          id?: string
          observed_at?: string
          security_id?: string
          session_date?: string
          source_as_of?: string
          symbol?: string
        }
        Relationships: []
      }
      investment_reconstruction_artifacts: {
        Row: {
          content: Json
          content_hash: string
          created_at: string
          decision_cutoff: string
          id: string
          replay_run_id: string
          window_start: string
        }
        Insert: {
          content: Json
          content_hash: string
          created_at?: string
          decision_cutoff: string
          id?: string
          replay_run_id: string
          window_start: string
        }
        Update: {
          content?: Json
          content_hash?: string
          created_at?: string
          decision_cutoff?: string
          id?: string
          replay_run_id?: string
          window_start?: string
        }
        Relationships: []
      }
      investment_theses: {
        Row: {
          content: Json
          data_as_of: string
          entity_key: string
          entity_type: string
          generated_at: string
          id: string
          owner_id: string
          research_note_id: string | null
          reviewed_at: string | null
          sector: string | null
          source_refs: Json
          status: string
          sub_industry: string | null
          symbol: string | null
          trigger: string
          version: number
        }
        Insert: {
          content: Json
          data_as_of: string
          entity_key: string
          entity_type: string
          generated_at?: string
          id?: string
          owner_id: string
          research_note_id?: string | null
          reviewed_at?: string | null
          sector?: string | null
          source_refs?: Json
          status: string
          sub_industry?: string | null
          symbol?: string | null
          trigger: string
          version: number
        }
        Update: {
          content?: Json
          data_as_of?: string
          entity_key?: string
          entity_type?: string
          generated_at?: string
          id?: string
          owner_id?: string
          research_note_id?: string | null
          reviewed_at?: string | null
          sector?: string | null
          source_refs?: Json
          status?: string
          sub_industry?: string | null
          symbol?: string | null
          trigger?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "investment_theses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_theses_research_note_id_fkey"
            columns: ["research_note_id"]
            isOneToOne: false
            referencedRelation: "equity_research_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_theses_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      investment_thesis_review_outcomes: {
        Row: {
          decision: string
          id: string
          investment_thesis_id: string
          owner_id: string
          rationale: string
          reviewed_at: string
        }
        Insert: {
          decision: string
          id?: string
          investment_thesis_id: string
          owner_id: string
          rationale: string
          reviewed_at?: string
        }
        Update: {
          decision?: string
          id?: string
          investment_thesis_id?: string
          owner_id?: string
          rationale?: string
          reviewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_thesis_review_outcomes_investment_thesis_id_fkey"
            columns: ["investment_thesis_id"]
            isOneToOne: true
            referencedRelation: "investment_theses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_thesis_review_outcomes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_positions: {
        Row: {
          cost_basis_per_share: number
          created_at: string
          id: string
          notes: string
          opened_at: string | null
          owner_id: string
          shares: number
          symbol: string
          updated_at: string
        }
        Insert: {
          cost_basis_per_share: number
          created_at?: string
          id?: string
          notes?: string
          opened_at?: string | null
          owner_id: string
          shares: number
          symbol: string
          updated_at?: string
        }
        Update: {
          cost_basis_per_share?: number
          created_at?: string
          id?: string
          notes?: string
          opened_at?: string | null
          owner_id?: string
          shares?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_positions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_positions_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      market_assets: {
        Row: {
          active: boolean
          alpaca_id: string | null
          asset_class: string
          created_at: string
          exchange: string
          name: string
          raw: Json
          source: string
          source_as_of: string
          status: string
          symbol: string
          tradable: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          alpaca_id?: string | null
          asset_class?: string
          created_at?: string
          exchange: string
          name: string
          raw?: Json
          source?: string
          source_as_of: string
          status?: string
          symbol: string
          tradable?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          alpaca_id?: string | null
          asset_class?: string
          created_at?: string
          exchange?: string
          name?: string
          raw?: Json
          source?: string
          source_as_of?: string
          status?: string
          symbol?: string
          tradable?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      market_bars_daily: {
        Row: {
          close: number
          created_at: string
          feed: string
          high: number
          low: number
          open: number
          retrieved_at: string | null
          source_as_of: string
          symbol: string
          trade_count: number | null
          trading_date: string
          volume: number
          vwap: number | null
        }
        Insert: {
          close: number
          created_at?: string
          feed: string
          high: number
          low: number
          open: number
          retrieved_at?: string | null
          source_as_of: string
          symbol: string
          trade_count?: number | null
          trading_date: string
          volume: number
          vwap?: number | null
        }
        Update: {
          close?: number
          created_at?: string
          feed?: string
          high?: number
          low?: number
          open?: number
          retrieved_at?: string | null
          source_as_of?: string
          symbol?: string
          trade_count?: number | null
          trading_date?: string
          volume?: number
          vwap?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_bars_daily_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      market_corpus_backup_runs: {
        Row: {
          byte_count: number | null
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          output: Json
          snapshot_id: string | null
          started_at: string
          status: string
        }
        Insert: {
          byte_count?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          output?: Json
          snapshot_id?: string | null
          started_at?: string
          status: string
        }
        Update: {
          byte_count?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          output?: Json
          snapshot_id?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      market_divergence_signals: {
        Row: {
          group_label: string
          long_term_return: number
          near_term_return: number
          scope: string
          signal_id: string
          snapshot_id: string
          spread: number
          summary: string
          symbol: string | null
        }
        Insert: {
          group_label: string
          long_term_return: number
          near_term_return: number
          scope: string
          signal_id: string
          snapshot_id: string
          spread: number
          summary: string
          symbol?: string | null
        }
        Update: {
          group_label?: string
          long_term_return?: number
          near_term_return?: number
          scope?: string
          signal_id?: string
          snapshot_id?: string
          spread?: number
          summary?: string
          symbol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_divergence_signals_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "market_leadership_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      market_domain_admission_reviews: {
        Row: {
          created_at: string
          decision: string
          domain_id: string
          id: string
          maintenance_owner: string
          pack_version: number
          rationale: string
          reviewer_id: string | null
          rubric: Json
        }
        Insert: {
          created_at?: string
          decision: string
          domain_id: string
          id?: string
          maintenance_owner: string
          pack_version: number
          rationale: string
          reviewer_id?: string | null
          rubric: Json
        }
        Update: {
          created_at?: string
          decision?: string
          domain_id?: string
          id?: string
          maintenance_owner?: string
          pack_version?: number
          rationale?: string
          reviewer_id?: string | null
          rubric?: Json
        }
        Relationships: [
          {
            foreignKeyName: "market_domain_admission_reviews_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "market_domain_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_domain_admission_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
        ]
      }
      market_domain_pack_events: {
        Row: {
          action: string
          created_at: string
          domain_id: string
          id: string
          reason: string
          source_ids: Json
        }
        Insert: {
          action: string
          created_at?: string
          domain_id: string
          id?: string
          reason: string
          source_ids?: Json
        }
        Update: {
          action?: string
          created_at?: string
          domain_id?: string
          id?: string
          reason?: string
          source_ids?: Json
        }
        Relationships: [
          {
            foreignKeyName: "market_domain_pack_events_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "market_domain_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      market_domain_packs: {
        Row: {
          created_at: string
          definition: Json
          description: string
          id: string
          label: string
          parent_domain_id: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          definition: Json
          description: string
          id: string
          label: string
          parent_domain_id?: string | null
          status: string
          updated_at?: string
          version: number
        }
        Update: {
          created_at?: string
          definition?: Json
          description?: string
          id?: string
          label?: string
          parent_domain_id?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_domain_packs_parent_domain_id_fkey"
            columns: ["parent_domain_id"]
            isOneToOne: false
            referencedRelation: "market_domain_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      market_group_metrics: {
        Row: {
          constituent_count: number
          day_return: number | null
          group_type: string
          label: string
          return_1y: number | null
          return_200d: number | null
          return_30d: number | null
          return_50d: number | null
          sector: string
          snapshot_id: string
          vs_200_day_average: number | null
          vs_50_day_average: number | null
        }
        Insert: {
          constituent_count: number
          day_return?: number | null
          group_type: string
          label: string
          return_1y?: number | null
          return_200d?: number | null
          return_30d?: number | null
          return_50d?: number | null
          sector?: string
          snapshot_id: string
          vs_200_day_average?: number | null
          vs_50_day_average?: number | null
        }
        Update: {
          constituent_count?: number
          day_return?: number | null
          group_type?: string
          label?: string
          return_1y?: number | null
          return_200d?: number | null
          return_30d?: number | null
          return_50d?: number | null
          sector?: string
          snapshot_id?: string
          vs_200_day_average?: number | null
          vs_50_day_average?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_group_metrics_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "market_leadership_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      market_home_snapshots: {
        Row: {
          content: Json
          created_at: string
          data_as_of: string
          generated_at: string
          snapshot_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          data_as_of: string
          generated_at?: string
          snapshot_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          data_as_of?: string
          generated_at?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_home_snapshots_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: true
            referencedRelation: "market_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      market_hypotheses: {
        Row: {
          causal_graph: Json
          confidence: number
          core_mechanism: string
          counter_thesis: string
          created_at: string
          horizon: string
          id: string
          owner_id: string
          parent_hypothesis_id: string | null
          scope: string
          status: string
          title: string
          unresolved_nodes: Json
          updated_at: string
        }
        Insert: {
          causal_graph?: Json
          confidence: number
          core_mechanism: string
          counter_thesis: string
          created_at?: string
          horizon: string
          id?: string
          owner_id: string
          parent_hypothesis_id?: string | null
          scope: string
          status: string
          title: string
          unresolved_nodes?: Json
          updated_at?: string
        }
        Update: {
          causal_graph?: Json
          confidence?: number
          core_mechanism?: string
          counter_thesis?: string
          created_at?: string
          horizon?: string
          id?: string
          owner_id?: string
          parent_hypothesis_id?: string | null
          scope?: string
          status?: string
          title?: string
          unresolved_nodes?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_hypotheses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_hypotheses_parent_hypothesis_id_fkey"
            columns: ["parent_hypothesis_id"]
            isOneToOne: false
            referencedRelation: "market_hypotheses"
            referencedColumns: ["id"]
          },
        ]
      }
      market_hypothesis_cross_domain_links: {
        Row: {
          confidence: number
          created_at: string
          explanation: string
          from_hypothesis_id: string
          id: string
          link_id: string
          owner_id: string
          relationship: string
          source_observation_ids: Json
          status: string
          to_hypothesis_id: string
          updated_at: string
        }
        Insert: {
          confidence: number
          created_at?: string
          explanation: string
          from_hypothesis_id: string
          id?: string
          link_id: string
          owner_id: string
          relationship: string
          source_observation_ids?: Json
          status: string
          to_hypothesis_id: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          explanation?: string
          from_hypothesis_id?: string
          id?: string
          link_id?: string
          owner_id?: string
          relationship?: string
          source_observation_ids?: Json
          status?: string
          to_hypothesis_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_hypothesis_cross_domain_links_from_hypothesis_id_fkey"
            columns: ["from_hypothesis_id"]
            isOneToOne: false
            referencedRelation: "market_hypotheses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_hypothesis_cross_domain_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_hypothesis_cross_domain_links_to_hypothesis_id_fkey"
            columns: ["to_hypothesis_id"]
            isOneToOne: false
            referencedRelation: "market_hypotheses"
            referencedColumns: ["id"]
          },
        ]
      }
      market_hypothesis_evidence: {
        Row: {
          causal_node: string
          explanation: string
          hypothesis_id: string
          observation_id: string
          role: string
          weight: number
        }
        Insert: {
          causal_node: string
          explanation: string
          hypothesis_id: string
          observation_id: string
          role: string
          weight: number
        }
        Update: {
          causal_node?: string
          explanation?: string
          hypothesis_id?: string
          observation_id?: string
          role?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_hypothesis_evidence_hypothesis_id_fkey"
            columns: ["hypothesis_id"]
            isOneToOne: false
            referencedRelation: "market_hypotheses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_hypothesis_evidence_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "world_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      market_hypothesis_research_frontier: {
        Row: {
          adapter_id: string | null
          attempt_count: number
          causal_node: string
          created_at: string
          evidence_needed: string
          hypothesis_id: string
          id: string
          last_error: string | null
          next_run_at: string | null
          priority: number
          question: string
          research_version_id: string | null
          source_types: Json
          status: string
          updated_at: string
        }
        Insert: {
          adapter_id?: string | null
          attempt_count?: number
          causal_node: string
          created_at?: string
          evidence_needed: string
          hypothesis_id: string
          id?: string
          last_error?: string | null
          next_run_at?: string | null
          priority: number
          question: string
          research_version_id?: string | null
          source_types?: Json
          status: string
          updated_at?: string
        }
        Update: {
          adapter_id?: string | null
          attempt_count?: number
          causal_node?: string
          created_at?: string
          evidence_needed?: string
          hypothesis_id?: string
          id?: string
          last_error?: string | null
          next_run_at?: string | null
          priority?: number
          question?: string
          research_version_id?: string | null
          source_types?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_hypothesis_research_frontier_hypothesis_id_fkey"
            columns: ["hypothesis_id"]
            isOneToOne: false
            referencedRelation: "market_hypotheses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_hypothesis_research_frontier_research_version_id_fkey"
            columns: ["research_version_id"]
            isOneToOne: false
            referencedRelation: "market_hypothesis_research_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      market_hypothesis_research_versions: {
        Row: {
          content: Json
          created_at: string
          critic_generated_at: string | null
          critic_model: string | null
          critic_provider: string | null
          critique: Json | null
          data_as_of: string
          error: string | null
          generated_at: string | null
          hypothesis_id: string
          id: string
          model: string | null
          observation_ids: Json
          prior_research_version_id: string | null
          provider: string | null
          revision_diff: Json
          source_ids: Json
          status: string
          version: number
        }
        Insert: {
          content?: Json
          created_at?: string
          critic_generated_at?: string | null
          critic_model?: string | null
          critic_provider?: string | null
          critique?: Json | null
          data_as_of: string
          error?: string | null
          generated_at?: string | null
          hypothesis_id: string
          id?: string
          model?: string | null
          observation_ids?: Json
          prior_research_version_id?: string | null
          provider?: string | null
          revision_diff?: Json
          source_ids?: Json
          status: string
          version: number
        }
        Update: {
          content?: Json
          created_at?: string
          critic_generated_at?: string | null
          critic_model?: string | null
          critic_provider?: string | null
          critique?: Json | null
          data_as_of?: string
          error?: string | null
          generated_at?: string | null
          hypothesis_id?: string
          id?: string
          model?: string | null
          observation_ids?: Json
          prior_research_version_id?: string | null
          provider?: string | null
          revision_diff?: Json
          source_ids?: Json
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_hypothesis_research_versi_prior_research_version_id_fkey"
            columns: ["prior_research_version_id"]
            isOneToOne: false
            referencedRelation: "market_hypothesis_research_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_hypothesis_research_versions_hypothesis_id_fkey"
            columns: ["hypothesis_id"]
            isOneToOne: false
            referencedRelation: "market_hypotheses"
            referencedColumns: ["id"]
          },
        ]
      }
      market_interest_inventories: {
        Row: {
          content: Json
          owner_id: string
          refreshed_at: string
          version: number
        }
        Insert: {
          content: Json
          owner_id: string
          refreshed_at?: string
          version?: number
        }
        Update: {
          content?: Json
          owner_id?: string
          refreshed_at?: string
          version?: number
        }
        Relationships: []
      }
      market_interest_memberships: {
        Row: {
          active: boolean
          eligible_since: string
          excluded: boolean
          owner_id: string
          provenance: Json
          refreshed_at: string
          symbol: string
          theme: string
          version: number
        }
        Insert: {
          active?: boolean
          eligible_since?: string
          excluded?: boolean
          owner_id: string
          provenance: Json
          refreshed_at?: string
          symbol: string
          theme: string
          version?: number
        }
        Update: {
          active?: boolean
          eligible_since?: string
          excluded?: boolean
          owner_id?: string
          provenance?: Json
          refreshed_at?: string
          symbol?: string
          theme?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_interest_memberships_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      market_leadership_snapshots: {
        Row: {
          above_50_day_percent: number | null
          advancing_percent: number | null
          data_as_of: string
          error: string | null
          fresh_count: number
          generated_at: string
          id: string
          is_latest: boolean
          published_at: string | null
          status: string
          trading_date: string
          universe_count: number
          usable_count: number
        }
        Insert: {
          above_50_day_percent?: number | null
          advancing_percent?: number | null
          data_as_of: string
          error?: string | null
          fresh_count?: number
          generated_at?: string
          id?: string
          is_latest?: boolean
          published_at?: string | null
          status?: string
          trading_date: string
          universe_count: number
          usable_count?: number
        }
        Update: {
          above_50_day_percent?: number | null
          advancing_percent?: number | null
          data_as_of?: string
          error?: string | null
          fresh_count?: number
          generated_at?: string
          id?: string
          is_latest?: boolean
          published_at?: string | null
          status?: string
          trading_date?: string
          universe_count?: number
          usable_count?: number
        }
        Relationships: []
      }
      market_memos: {
        Row: {
          content: Json
          generated_at: string
          id: string
          market_state_id: string
          model: string
          provider: string
          sources: Json
        }
        Insert: {
          content: Json
          generated_at?: string
          id?: string
          market_state_id: string
          model: string
          provider: string
          sources?: Json
        }
        Update: {
          content?: Json
          generated_at?: string
          id?: string
          market_state_id?: string
          model?: string
          provider?: string
          sources?: Json
        }
        Relationships: [
          {
            foreignKeyName: "market_memos_market_state_id_fkey"
            columns: ["market_state_id"]
            isOneToOne: true
            referencedRelation: "market_states"
            referencedColumns: ["id"]
          },
        ]
      }
      market_orchestration_actions: {
        Row: {
          action_type: string
          created_at: string
          deterministic_signals: Json
          domain_id: string
          id: string
          job_id: string | null
          job_type: string | null
          priority: number
          rationale: string
          run_id: string
          state: string
        }
        Insert: {
          action_type: string
          created_at?: string
          deterministic_signals?: Json
          domain_id: string
          id?: string
          job_id?: string | null
          job_type?: string | null
          priority: number
          rationale: string
          run_id: string
          state: string
        }
        Update: {
          action_type?: string
          created_at?: string
          deterministic_signals?: Json
          domain_id?: string
          id?: string
          job_id?: string | null
          job_type?: string | null
          priority?: number
          rationale?: string
          run_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_orchestration_actions_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "market_domain_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_orchestration_actions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_orchestration_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "market_orchestration_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      market_orchestration_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          input_summary: Json
          market_regime: string | null
          status: string
          trigger: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input_summary?: Json
          market_regime?: string | null
          status: string
          trigger: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input_summary?: Json
          market_regime?: string | null
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      market_research_scout_runs: {
        Row: {
          created_at: string
          domain_id: string
          error: string | null
          frontier_ids: string[]
          generated_at: string | null
          id: string
          leads: Json
          model: string | null
          provider: string | null
          reason: string
          requested_at: string
          status: string
          trigger: string
          unresolved_questions: Json
        }
        Insert: {
          created_at?: string
          domain_id: string
          error?: string | null
          frontier_ids?: string[]
          generated_at?: string | null
          id?: string
          leads?: Json
          model?: string | null
          provider?: string | null
          reason: string
          requested_at?: string
          status: string
          trigger: string
          unresolved_questions?: Json
        }
        Update: {
          created_at?: string
          domain_id?: string
          error?: string | null
          frontier_ids?: string[]
          generated_at?: string | null
          id?: string
          leads?: Json
          model?: string | null
          provider?: string | null
          reason?: string
          requested_at?: string
          status?: string
          trigger?: string
          unresolved_questions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "market_research_scout_runs_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "market_domain_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      market_snapshots: {
        Row: {
          created_at: string
          data_as_of: string
          error: string | null
          feed: string
          history_through: string | null
          id: string
          is_latest: boolean
          published_at: string | null
          row_count: number
          status: string
        }
        Insert: {
          created_at?: string
          data_as_of: string
          error?: string | null
          feed: string
          history_through?: string | null
          id?: string
          is_latest?: boolean
          published_at?: string | null
          row_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          data_as_of?: string
          error?: string | null
          feed?: string
          history_through?: string | null
          id?: string
          is_latest?: boolean
          published_at?: string | null
          row_count?: number
          status?: string
        }
        Relationships: []
      }
      market_states: {
        Row: {
          confidence: number
          data_as_of: string
          generated_at: string
          id: string
          inputs: Json
          regime: string
          snapshot_id: string
        }
        Insert: {
          confidence: number
          data_as_of: string
          generated_at?: string
          id?: string
          inputs?: Json
          regime: string
          snapshot_id: string
        }
        Update: {
          confidence?: number
          data_as_of?: string
          generated_at?: string
          id?: string
          inputs?: Json
          regime?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_states_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: true
            referencedRelation: "market_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      market_stock_metrics: {
        Row: {
          company: string
          data_as_of: string
          day_return: number | null
          observation_count: number
          price: number
          relative_volume: number | null
          return_1y: number | null
          return_200d: number | null
          return_30d: number | null
          return_50d: number | null
          sector: string
          snapshot_id: string
          sub_industry: string
          symbol: string
          vs_200_day_average: number | null
          vs_50_day_average: number | null
        }
        Insert: {
          company: string
          data_as_of: string
          day_return?: number | null
          observation_count: number
          price: number
          relative_volume?: number | null
          return_1y?: number | null
          return_200d?: number | null
          return_30d?: number | null
          return_50d?: number | null
          sector: string
          snapshot_id: string
          sub_industry: string
          symbol: string
          vs_200_day_average?: number | null
          vs_50_day_average?: number | null
        }
        Update: {
          company?: string
          data_as_of?: string
          day_return?: number | null
          observation_count?: number
          price?: number
          relative_volume?: number | null
          return_1y?: number | null
          return_200d?: number | null
          return_30d?: number | null
          return_50d?: number | null
          sector?: string
          snapshot_id?: string
          sub_industry?: string
          symbol?: string
          vs_200_day_average?: number | null
          vs_50_day_average?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_stock_metrics_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "market_leadership_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_stock_metrics_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      market_thesis_company_links: {
        Row: {
          investment_thesis_id: string
          market_thesis_version_id: string
        }
        Insert: {
          investment_thesis_id: string
          market_thesis_version_id: string
        }
        Update: {
          investment_thesis_id?: string
          market_thesis_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_thesis_company_links_investment_thesis_id_fkey"
            columns: ["investment_thesis_id"]
            isOneToOne: false
            referencedRelation: "investment_theses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_thesis_company_links_market_thesis_version_id_fkey"
            columns: ["market_thesis_version_id"]
            isOneToOne: false
            referencedRelation: "market_thesis_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      market_thesis_exposures: {
        Row: {
          confidence: number
          entity_name: string
          id: string
          market_thesis_version_id: string
          materiality: number
          mechanism: string
          research_job_id: string | null
          research_queued_at: string | null
          resolution_method: string | null
          resolution_reason: string | null
          role: string
          source_ids: string[]
          symbol: string | null
          value_chain_layer: string
          verification_status: string
        }
        Insert: {
          confidence: number
          entity_name: string
          id?: string
          market_thesis_version_id: string
          materiality: number
          mechanism: string
          research_job_id?: string | null
          research_queued_at?: string | null
          resolution_method?: string | null
          resolution_reason?: string | null
          role: string
          source_ids?: string[]
          symbol?: string | null
          value_chain_layer: string
          verification_status: string
        }
        Update: {
          confidence?: number
          entity_name?: string
          id?: string
          market_thesis_version_id?: string
          materiality?: number
          mechanism?: string
          research_job_id?: string | null
          research_queued_at?: string | null
          resolution_method?: string | null
          resolution_reason?: string | null
          role?: string
          source_ids?: string[]
          symbol?: string | null
          value_chain_layer?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_thesis_exposures_market_thesis_version_id_fkey"
            columns: ["market_thesis_version_id"]
            isOneToOne: false
            referencedRelation: "market_thesis_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_thesis_exposures_research_job_id_fkey"
            columns: ["research_job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_thesis_exposures_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      market_thesis_prediction_evaluations: {
        Row: {
          created_at: string
          data_as_of: string
          error: string | null
          generated_at: string | null
          id: string
          model: string | null
          observation_ids: Json
          prediction_id: string
          provider: string | null
          rationale: string
          source_ids: Json
          status: string
          verdict: string
          version: number
        }
        Insert: {
          created_at?: string
          data_as_of: string
          error?: string | null
          generated_at?: string | null
          id?: string
          model?: string | null
          observation_ids?: Json
          prediction_id: string
          provider?: string | null
          rationale?: string
          source_ids?: Json
          status: string
          verdict: string
          version: number
        }
        Update: {
          created_at?: string
          data_as_of?: string
          error?: string | null
          generated_at?: string | null
          id?: string
          model?: string | null
          observation_ids?: Json
          prediction_id?: string
          provider?: string | null
          rationale?: string
          source_ids?: Json
          status?: string
          verdict?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_thesis_prediction_evaluations_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "market_thesis_predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      market_thesis_predictions: {
        Row: {
          deadline: string | null
          evaluated_at: string | null
          evidence_needed: string
          expected_direction: string
          id: string
          market_thesis_version_id: string
          prediction: string
          result: string
        }
        Insert: {
          deadline?: string | null
          evaluated_at?: string | null
          evidence_needed: string
          expected_direction: string
          id?: string
          market_thesis_version_id: string
          prediction: string
          result?: string
        }
        Update: {
          deadline?: string | null
          evaluated_at?: string | null
          evidence_needed?: string
          expected_direction?: string
          id?: string
          market_thesis_version_id?: string
          prediction?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_thesis_predictions_market_thesis_version_id_fkey"
            columns: ["market_thesis_version_id"]
            isOneToOne: false
            referencedRelation: "market_thesis_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      market_thesis_versions: {
        Row: {
          confidence: number
          content: Json
          data_as_of: string
          generated_at: string
          hypothesis_id: string
          id: string
          research_version_id: string | null
          revision_diff: Json
          state: string
          title: string
          version: number
        }
        Insert: {
          confidence: number
          content: Json
          data_as_of: string
          generated_at?: string
          hypothesis_id: string
          id?: string
          research_version_id?: string | null
          revision_diff?: Json
          state: string
          title: string
          version: number
        }
        Update: {
          confidence?: number
          content?: Json
          data_as_of?: string
          generated_at?: string
          hypothesis_id?: string
          id?: string
          research_version_id?: string | null
          revision_diff?: Json
          state?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_thesis_versions_hypothesis_id_fkey"
            columns: ["hypothesis_id"]
            isOneToOne: false
            referencedRelation: "market_hypotheses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_thesis_versions_research_version_id_fkey"
            columns: ["research_version_id"]
            isOneToOne: false
            referencedRelation: "market_hypothesis_research_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      market_universe_members: {
        Row: {
          active: boolean
          refreshed_at: string
          source: string
          source_as_of: string
          symbol: string
          universe: string
        }
        Insert: {
          active?: boolean
          refreshed_at?: string
          source: string
          source_as_of: string
          symbol: string
          universe: string
        }
        Update: {
          active?: boolean
          refreshed_at?: string
          source?: string
          source_as_of?: string
          symbol?: string
          universe?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_universe_members_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      market_universe_vintages: {
        Row: {
          active: boolean
          id: string
          observed_at: string
          security_id: string | null
          source: string
          source_as_of: string
          symbol: string
          universe: string
        }
        Insert: {
          active: boolean
          id?: string
          observed_at?: string
          security_id?: string | null
          source: string
          source_as_of: string
          symbol: string
          universe: string
        }
        Update: {
          active?: boolean
          id?: string
          observed_at?: string
          security_id?: string | null
          source?: string
          source_as_of?: string
          symbol?: string
          universe?: string
        }
        Relationships: []
      }
      market_users: {
        Row: {
          created_at: string
          id: string
          label: string
        }
        Insert: {
          created_at?: string
          id: string
          label: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      market_watchlist_items: {
        Row: {
          created_at: string
          symbol: string
          watchlist_id: string
        }
        Insert: {
          created_at?: string
          symbol: string
          watchlist_id: string
        }
        Update: {
          created_at?: string
          symbol?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_watchlist_items_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "market_watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "market_watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      market_watchlists: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          name: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_watchlists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
        ]
      }
      overviews: {
        Row: {
          artifact_metadata: Json | null
          content: string
          created_at: string
          date: string
          id: string
          period_end: string | null
          period_start: string | null
          type: string
        }
        Insert: {
          artifact_metadata?: Json | null
          content: string
          created_at?: string
          date: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          type: string
        }
        Update: {
          artifact_metadata?: Json | null
          content?: string
          created_at?: string
          date?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          type?: string
        }
        Relationships: []
      }
      owner_review_items: {
        Row: {
          attention_minutes: number
          causal_model_version_id: string | null
          created_at: string
          decision_type: string
          delta: Json
          id: string
          if_ignored: string
          metadata: Json
          owner_id: string
          owner_rationale: string | null
          priority: number
          reviewed_at: string | null
          source_ids: Json
          status: string
          subject_id: string
          subject_type: string
          title: string
          updated_at: string
          what_changed: string
          why_now: string
          world_opportunity_lead_id: string | null
        }
        Insert: {
          attention_minutes: number
          causal_model_version_id?: string | null
          created_at?: string
          decision_type: string
          delta?: Json
          id?: string
          if_ignored: string
          metadata?: Json
          owner_id: string
          owner_rationale?: string | null
          priority: number
          reviewed_at?: string | null
          source_ids?: Json
          status?: string
          subject_id: string
          subject_type: string
          title: string
          updated_at?: string
          what_changed: string
          why_now: string
          world_opportunity_lead_id?: string | null
        }
        Update: {
          attention_minutes?: number
          causal_model_version_id?: string | null
          created_at?: string
          decision_type?: string
          delta?: Json
          id?: string
          if_ignored?: string
          metadata?: Json
          owner_id?: string
          owner_rationale?: string | null
          priority?: number
          reviewed_at?: string | null
          source_ids?: Json
          status?: string
          subject_id?: string
          subject_type?: string
          title?: string
          updated_at?: string
          what_changed?: string
          why_now?: string
          world_opportunity_lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_review_items_causal_model_version_id_fkey"
            columns: ["causal_model_version_id"]
            isOneToOne: false
            referencedRelation: "causal_model_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_review_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_review_items_world_opportunity_lead_id_fkey"
            columns: ["world_opportunity_lead_id"]
            isOneToOne: false
            referencedRelation: "world_opportunity_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_confirmations: {
        Row: {
          as_of: string
          confirmed_at: string
          content: Json
          content_hash: string
          id: string
          owner_id: string
          portfolio_id: string
          request_id: string
        }
        Insert: {
          as_of: string
          confirmed_at?: string
          content: Json
          content_hash: string
          id?: string
          owner_id: string
          portfolio_id: string
          request_id: string
        }
        Update: {
          as_of?: string
          confirmed_at?: string
          content?: Json
          content_hash?: string
          id?: string
          owner_id?: string
          portfolio_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_confirmations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_transactions: {
        Row: {
          action: string
          created_at: string
          external_key: string | null
          fees: number
          id: string
          notes: string
          occurred_at: string
          owner_id: string
          portfolio_id: string
          price_per_share: number
          quantity: number | null
          source: string
          symbol: string | null
        }
        Insert: {
          action: string
          created_at?: string
          external_key?: string | null
          fees?: number
          id?: string
          notes?: string
          occurred_at?: string
          owner_id: string
          portfolio_id: string
          price_per_share: number
          quantity?: number | null
          source: string
          symbol?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          external_key?: string | null
          fees?: number
          id?: string
          notes?: string
          occurred_at?: string
          owner_id?: string
          portfolio_id?: string
          price_per_share?: number
          quantity?: number | null
          source?: string
          symbol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_transactions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_transactions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          created_at: string
          id: string
          initial_funds: number
          kind: string
          name: string
          owner_id: string
          started_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          initial_funds?: number
          kind: string
          name: string
          owner_id: string
          started_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          initial_funds?: number
          kind?: string
          name?: string
          owner_id?: string
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_batches: {
        Row: {
          coverage: Json
          decision_date: string
          id: string
          manifest_id: string
          model_metadata: Json
          owner_id: string
          policy_version: string
          published_at: string
          summary: string
        }
        Insert: {
          coverage: Json
          decision_date: string
          id?: string
          manifest_id: string
          model_metadata: Json
          owner_id: string
          policy_version: string
          published_at?: string
          summary: string
        }
        Update: {
          coverage?: Json
          decision_date?: string
          id?: string
          manifest_id?: string
          model_metadata?: Json
          owner_id?: string
          policy_version?: string
          published_at?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_batches_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: true
            referencedRelation: "recommendation_input_manifests"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_cohort_reviews: {
        Row: {
          cohort_key: string
          content: Json
          content_hash: string
          created_at: string
          id: string
          owner_id: string
          policy_version: string
        }
        Insert: {
          cohort_key: string
          content: Json
          content_hash: string
          created_at?: string
          id?: string
          owner_id: string
          policy_version: string
        }
        Update: {
          cohort_key?: string
          content?: Json
          content_hash?: string
          created_at?: string
          id?: string
          owner_id?: string
          policy_version?: string
        }
        Relationships: []
      }
      recommendation_evaluation_tasks: {
        Row: {
          checkpoint_date: string | null
          error: string | null
          evaluator_version: string | null
          horizon: string
          id: string
          kind: string
          last_checked_at: string | null
          not_before: string
          owner_id: string
          recommendation_id: string
          retrospective: boolean
          status: string
        }
        Insert: {
          checkpoint_date?: string | null
          error?: string | null
          evaluator_version?: string | null
          horizon: string
          id?: string
          kind: string
          last_checked_at?: string | null
          not_before: string
          owner_id: string
          recommendation_id: string
          retrospective?: boolean
          status?: string
        }
        Update: {
          checkpoint_date?: string | null
          error?: string | null
          evaluator_version?: string | null
          horizon?: string
          id?: string
          kind?: string
          last_checked_at?: string | null
          not_before?: string
          owner_id?: string
          recommendation_id?: string
          retrospective?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_evaluation_tasks_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendation_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_evaluations: {
        Row: {
          as_of: string
          content: Json
          content_hash: string
          created_at: string
          evaluator_version: string
          horizon: string
          id: string
          kind: string
          owner_id: string
          recommendation_id: string
          supersedes_id: string | null
        }
        Insert: {
          as_of: string
          content: Json
          content_hash: string
          created_at?: string
          evaluator_version: string
          horizon: string
          id?: string
          kind: string
          owner_id: string
          recommendation_id: string
          supersedes_id?: string | null
        }
        Update: {
          as_of?: string
          content?: Json
          content_hash?: string
          created_at?: string
          evaluator_version?: string
          horizon?: string
          id?: string
          kind?: string
          owner_id?: string
          recommendation_id?: string
          supersedes_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_evaluations_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendation_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_evaluations_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "recommendation_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_forecasts: {
        Row: {
          content: Json
          deadline: string
          id: string
          ordinal: number
          owner_id: string
          probability: number
          recommendation_id: string
        }
        Insert: {
          content: Json
          deadline: string
          id?: string
          ordinal: number
          owner_id: string
          probability: number
          recommendation_id: string
        }
        Update: {
          content?: Json
          deadline?: string
          id?: string
          ordinal?: number
          owner_id?: string
          probability?: number
          recommendation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_forecasts_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendation_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_input_manifests: {
        Row: {
          content: Json
          content_hash: string
          created_at: string
          decision_cutoff: string
          decision_date: string
          edition_key: string
          id: string
          owner_id: string
          policy_version: string
        }
        Insert: {
          content: Json
          content_hash: string
          created_at?: string
          decision_cutoff: string
          decision_date: string
          edition_key?: string
          id: string
          owner_id: string
          policy_version: string
        }
        Update: {
          content?: Json
          content_hash?: string
          created_at?: string
          decision_cutoff?: string
          decision_date?: string
          edition_key?: string
          id?: string
          owner_id?: string
          policy_version?: string
        }
        Relationships: []
      }
      recommendation_owner_events: {
        Row: {
          details: Json
          event_type: string
          id: string
          occurred_at: string
          owner_id: string
          rationale: string
          recommendation_id: string
          recorded_at: string
          request_id: string
        }
        Insert: {
          details?: Json
          event_type: string
          id?: string
          occurred_at: string
          owner_id: string
          rationale: string
          recommendation_id: string
          recorded_at?: string
          request_id: string
        }
        Update: {
          details?: Json
          event_type?: string
          id?: string
          occurred_at?: string
          owner_id?: string
          rationale?: string
          recommendation_id?: string
          recorded_at?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_owner_events_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendation_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_policy_experiments: {
        Row: {
          content: Json
          created_at: string
          event_type: string
          id: string
          owner_id: string
          parent_id: string | null
          policy_key: string
        }
        Insert: {
          content: Json
          created_at?: string
          event_type: string
          id?: string
          owner_id: string
          parent_id?: string | null
          policy_key: string
        }
        Update: {
          content?: Json
          created_at?: string
          event_type?: string
          id?: string
          owner_id?: string
          parent_id?: string | null
          policy_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_policy_experiments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "recommendation_policy_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_shadow_evaluations: {
        Row: {
          content: Json
          content_hash: string
          created_at: string
          evaluator_version: string
          experiment_id: string
          id: string
          owner_id: string
        }
        Insert: {
          content: Json
          content_hash: string
          created_at?: string
          evaluator_version: string
          experiment_id: string
          id?: string
          owner_id: string
        }
        Update: {
          content?: Json
          content_hash?: string
          created_at?: string
          evaluator_version?: string
          experiment_id?: string
          id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_shadow_evaluations_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "recommendation_policy_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_shadow_runs: {
        Row: {
          batch_id: string
          content: Json
          content_hash: string
          created_at: string
          experiment_id: string
          id: string
          manifest_id: string
          owner_id: string
          policy_key: string
        }
        Insert: {
          batch_id: string
          content: Json
          content_hash: string
          created_at?: string
          experiment_id: string
          id?: string
          manifest_id: string
          owner_id: string
          policy_key: string
        }
        Update: {
          batch_id?: string
          content?: Json
          content_hash?: string
          created_at?: string
          experiment_id?: string
          id?: string
          manifest_id?: string
          owner_id?: string
          policy_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_shadow_runs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "recommendation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_shadow_runs_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "recommendation_policy_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_shadow_runs_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: false
            referencedRelation: "recommendation_input_manifests"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_versions: {
        Row: {
          action: string
          batch_id: string
          content: Json
          episode_id: string
          id: string
          issued_at: string
          owner_id: string
          portfolio_id: string
          security_id: string
          supersedes_id: string | null
          symbol: string
          version: number
        }
        Insert: {
          action: string
          batch_id: string
          content: Json
          episode_id: string
          id?: string
          issued_at?: string
          owner_id: string
          portfolio_id: string
          security_id: string
          supersedes_id?: string | null
          symbol: string
          version: number
        }
        Update: {
          action?: string
          batch_id?: string
          content?: Json
          episode_id?: string
          id?: string
          issued_at?: string
          owner_id?: string
          portfolio_id?: string
          security_id?: string
          supersedes_id?: string | null
          symbol?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_versions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "recommendation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_versions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "recommendation_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      research_investigation_slots: {
        Row: {
          contract_version: number
          created_at: string
          investigation_date: string
          job_id: string | null
          lane: string
          owner_id: string
          reservation_key: string
          started_at: string | null
          symbol: string
        }
        Insert: {
          contract_version: number
          created_at?: string
          investigation_date: string
          job_id?: string | null
          lane: string
          owner_id: string
          reservation_key: string
          started_at?: string | null
          symbol: string
        }
        Update: {
          contract_version?: number
          created_at?: string
          investigation_date?: string
          job_id?: string | null
          lane?: string
          owner_id?: string
          reservation_key?: string
          started_at?: string | null
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_investigation_slots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_refresh_checks: {
        Row: {
          classification: string
          content: Json
          created_at: string
          evidence_hash: string
          id: string
          input_hash: string
          instrument_type: string
          owner_id: string
          packet_id: string
          research_note_id: string | null
          symbol: string
        }
        Insert: {
          classification: string
          content: Json
          created_at?: string
          evidence_hash: string
          id?: string
          input_hash: string
          instrument_type: string
          owner_id: string
          packet_id: string
          research_note_id?: string | null
          symbol: string
        }
        Update: {
          classification?: string
          content?: Json
          created_at?: string
          evidence_hash?: string
          id?: string
          input_hash?: string
          instrument_type?: string
          owner_id?: string
          packet_id?: string
          research_note_id?: string | null
          symbol?: string
        }
        Relationships: []
      }
      saved_screener_screens: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          query: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          query: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          query?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_screener_screens_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
        ]
      }
      screener_rows: {
        Row: {
          company: string
          created_at: string
          daily_change: number
          data_as_of: string
          exchange: string
          fifty_day_average: number
          fifty_two_week_position: number
          gap: number
          history_provenance: Json | null
          price: number
          range_values: Json
          relative_volume: number
          return_180d: number | null
          return_1y: number | null
          return_30d: number | null
          return_5d: number | null
          return_90d: number | null
          return_ytd: number | null
          sector: string | null
          snapshot_id: string
          sub_industry: string | null
          symbol: string
          tradable: boolean
          volume: number
        }
        Insert: {
          company: string
          created_at?: string
          daily_change: number
          data_as_of: string
          exchange: string
          fifty_day_average: number
          fifty_two_week_position: number
          gap: number
          history_provenance?: Json | null
          price: number
          range_values?: Json
          relative_volume: number
          return_180d?: number | null
          return_1y?: number | null
          return_30d?: number | null
          return_5d?: number | null
          return_90d?: number | null
          return_ytd?: number | null
          sector?: string | null
          snapshot_id: string
          sub_industry?: string | null
          symbol: string
          tradable: boolean
          volume: number
        }
        Update: {
          company?: string
          created_at?: string
          daily_change?: number
          data_as_of?: string
          exchange?: string
          fifty_day_average?: number
          fifty_two_week_position?: number
          gap?: number
          history_provenance?: Json | null
          price?: number
          range_values?: Json
          relative_volume?: number
          return_180d?: number | null
          return_1y?: number | null
          return_30d?: number | null
          return_5d?: number | null
          return_90d?: number | null
          return_ytd?: number | null
          sector?: string | null
          snapshot_id?: string
          sub_industry?: string | null
          symbol?: string
          tradable?: boolean
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "screener_rows_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "market_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screener_rows_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      thesis_decisions: {
        Row: {
          change_summary: Json
          constraint_status: string
          conviction: number | null
          created_at: string
          disposition: string
          entry_action: string
          entry_zone_high: number | null
          entry_zone_low: number | null
          fair_value: number | null
          formal_rating: string
          id: string
          investment_thesis_id: string | null
          kill_criteria: Json
          next_catalyst: string | null
          owner_id: string
          portfolio_id: string | null
          price_at_decision: number | null
          rationale: string
          research_note_id: string | null
          sizing_inputs: Json | null
          symbol: string
          valuation_support: string
          version: number
          what_changed: string
        }
        Insert: {
          change_summary?: Json
          constraint_status?: string
          conviction?: number | null
          created_at?: string
          disposition: string
          entry_action: string
          entry_zone_high?: number | null
          entry_zone_low?: number | null
          fair_value?: number | null
          formal_rating: string
          id?: string
          investment_thesis_id?: string | null
          kill_criteria?: Json
          next_catalyst?: string | null
          owner_id: string
          portfolio_id?: string | null
          price_at_decision?: number | null
          rationale?: string
          research_note_id?: string | null
          sizing_inputs?: Json | null
          symbol: string
          valuation_support?: string
          version: number
          what_changed?: string
        }
        Update: {
          change_summary?: Json
          constraint_status?: string
          conviction?: number | null
          created_at?: string
          disposition?: string
          entry_action?: string
          entry_zone_high?: number | null
          entry_zone_low?: number | null
          fair_value?: number | null
          formal_rating?: string
          id?: string
          investment_thesis_id?: string | null
          kill_criteria?: Json
          next_catalyst?: string | null
          owner_id?: string
          portfolio_id?: string | null
          price_at_decision?: number | null
          rationale?: string
          research_note_id?: string | null
          sizing_inputs?: Json | null
          symbol?: string
          valuation_support?: string
          version?: number
          what_changed?: string
        }
        Relationships: [
          {
            foreignKeyName: "thesis_decisions_investment_thesis_id_fkey"
            columns: ["investment_thesis_id"]
            isOneToOne: false
            referencedRelation: "investment_theses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_decisions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_decisions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_decisions_research_note_id_fkey"
            columns: ["research_note_id"]
            isOneToOne: false
            referencedRelation: "equity_research_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_decisions_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      thesis_monitor_runs: {
        Row: {
          data_fingerprint: string
          error: string | null
          evaluated_at: string
          evidence: Json
          findings: Json
          id: string
          monitor_id: string
          outcome: string
          owner_id: string
          reason_codes: string[]
          thesis_id: string
        }
        Insert: {
          data_fingerprint: string
          error?: string | null
          evaluated_at?: string
          evidence?: Json
          findings?: Json
          id?: string
          monitor_id: string
          outcome: string
          owner_id: string
          reason_codes?: string[]
          thesis_id: string
        }
        Update: {
          data_fingerprint?: string
          error?: string | null
          evaluated_at?: string
          evidence?: Json
          findings?: Json
          id?: string
          monitor_id?: string
          outcome?: string
          owner_id?: string
          reason_codes?: string[]
          thesis_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thesis_monitor_runs_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "thesis_monitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_monitor_runs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_monitor_runs_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "investment_theses"
            referencedColumns: ["id"]
          },
        ]
      }
      thesis_monitors: {
        Row: {
          coverage: Json
          created_at: string
          entity_key: string
          failure_count: number
          id: string
          last_checked_at: string | null
          last_error: string | null
          last_evidence_at: string | null
          last_outcome: string
          last_state: Json
          owner_id: string
          status: string
          thesis_id: string
          updated_at: string
        }
        Insert: {
          coverage?: Json
          created_at?: string
          entity_key: string
          failure_count?: number
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_evidence_at?: string | null
          last_outcome?: string
          last_state?: Json
          owner_id: string
          status?: string
          thesis_id: string
          updated_at?: string
        }
        Update: {
          coverage?: Json
          created_at?: string
          entity_key?: string
          failure_count?: number
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_evidence_at?: string | null
          last_outcome?: string
          last_state?: Json
          owner_id?: string
          status?: string
          thesis_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "thesis_monitors_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_monitors_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "investment_theses"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_claim_gate: {
        Row: {
          expected_release_sha: string | null
          paused: boolean
          reason: string | null
          singleton: boolean
          updated_at: string
        }
        Insert: {
          expected_release_sha?: string | null
          paused?: boolean
          reason?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          expected_release_sha?: string | null
          paused?: boolean
          reason?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      worker_heartbeats: {
        Row: {
          codex_enabled: boolean
          fmp_enabled: boolean
          last_seen_at: string
          scheduler_enabled: boolean
          worker_id: string
        }
        Insert: {
          codex_enabled: boolean
          fmp_enabled: boolean
          last_seen_at?: string
          scheduler_enabled: boolean
          worker_id: string
        }
        Update: {
          codex_enabled?: boolean
          fmp_enabled?: boolean
          last_seen_at?: string
          scheduler_enabled?: boolean
          worker_id?: string
        }
        Relationships: []
      }
      world_attention_decisions: {
        Row: {
          decided_at: string
          dimensions: Json
          event_cluster_id: string
          id: string
          policy_version: string
          reasons: Json
          route: string
          selected_for_enrichment: boolean
          source_lane: string
          specialist_lenses: Json
        }
        Insert: {
          decided_at?: string
          dimensions: Json
          event_cluster_id: string
          id?: string
          policy_version: string
          reasons?: Json
          route: string
          selected_for_enrichment?: boolean
          source_lane: string
          specialist_lenses?: Json
        }
        Update: {
          decided_at?: string
          dimensions?: Json
          event_cluster_id?: string
          id?: string
          policy_version?: string
          reasons?: Json
          route?: string
          selected_for_enrichment?: boolean
          source_lane?: string
          specialist_lenses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "world_attention_decisions_event_cluster_id_fkey"
            columns: ["event_cluster_id"]
            isOneToOne: false
            referencedRelation: "world_event_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      world_attention_policy_versions: {
        Row: {
          activated_at: string | null
          change_summary: string
          created_at: string
          created_by: string | null
          id: string
          parent_version: string | null
          policy: Json
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          activated_at?: string | null
          change_summary: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_version?: string | null
          policy: Json
          status: string
          updated_at?: string
          version: string
        }
        Update: {
          activated_at?: string | null
          change_summary?: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_version?: string | null
          policy?: Json
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_attention_policy_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
        ]
      }
      world_baselines: {
        Row: {
          content: Json
          data_as_of: string
          diff: Json
          freshness: string
          generated_at: string
          id: string
          markdown: string
          observation_ids: Json
          scope_key: string
          scope_type: string
          source_ids: Json
          version: number
        }
        Insert: {
          content: Json
          data_as_of: string
          diff?: Json
          freshness: string
          generated_at?: string
          id?: string
          markdown: string
          observation_ids?: Json
          scope_key: string
          scope_type: string
          source_ids?: Json
          version: number
        }
        Update: {
          content?: Json
          data_as_of?: string
          diff?: Json
          freshness?: string
          generated_at?: string
          id?: string
          markdown?: string
          observation_ids?: Json
          scope_key?: string
          scope_type?: string
          source_ids?: Json
          version?: number
        }
        Relationships: []
      }
      world_benchmark_cases: {
        Row: {
          as_of: string
          created_at: string
          event_cluster_id: string
          expected_primary_lens: string | null
          expected_route: string | null
          family: string
          hard_case: boolean
          id: string
          labeled_at: string | null
          labeled_by: string | null
          materiality: number
          observed_route: string
          observed_specialist_lenses: Json
          official_primary: boolean
          owner_notes: string | null
          source_ids: Json
          source_urls: Json
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          as_of: string
          created_at?: string
          event_cluster_id: string
          expected_primary_lens?: string | null
          expected_route?: string | null
          family: string
          hard_case?: boolean
          id?: string
          labeled_at?: string | null
          labeled_by?: string | null
          materiality: number
          observed_route: string
          observed_specialist_lenses?: Json
          official_primary?: boolean
          owner_notes?: string | null
          source_ids?: Json
          source_urls?: Json
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          as_of?: string
          created_at?: string
          event_cluster_id?: string
          expected_primary_lens?: string | null
          expected_route?: string | null
          family?: string
          hard_case?: boolean
          id?: string
          labeled_at?: string | null
          labeled_by?: string | null
          materiality?: number
          observed_route?: string
          observed_specialist_lenses?: Json
          official_primary?: boolean
          owner_notes?: string | null
          source_ids?: Json
          source_urls?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_benchmark_cases_event_cluster_id_fkey"
            columns: ["event_cluster_id"]
            isOneToOne: true
            referencedRelation: "world_event_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_benchmark_cases_labeled_by_fkey"
            columns: ["labeled_by"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
        ]
      }
      world_benchmark_results: {
        Row: {
          actual_route: string | null
          actual_specialist_lenses: Json
          benchmark_case_id: string
          benchmark_run_id: string
          created_at: string
          passed: boolean
          route_correct: boolean
          specialist_correct: boolean | null
        }
        Insert: {
          actual_route?: string | null
          actual_specialist_lenses?: Json
          benchmark_case_id: string
          benchmark_run_id: string
          created_at?: string
          passed: boolean
          route_correct: boolean
          specialist_correct?: boolean | null
        }
        Update: {
          actual_route?: string | null
          actual_specialist_lenses?: Json
          benchmark_case_id?: string
          benchmark_run_id?: string
          created_at?: string
          passed?: boolean
          route_correct?: boolean
          specialist_correct?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "world_benchmark_results_benchmark_case_id_fkey"
            columns: ["benchmark_case_id"]
            isOneToOne: false
            referencedRelation: "world_benchmark_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_benchmark_results_benchmark_run_id_fkey"
            columns: ["benchmark_run_id"]
            isOneToOne: false
            referencedRelation: "world_benchmark_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      world_benchmark_runs: {
        Row: {
          case_count: number
          created_at: string
          finished_at: string | null
          hard_case_regressions: Json
          id: string
          metrics: Json
          policy_version: string
          started_at: string
          status: string
        }
        Insert: {
          case_count?: number
          created_at?: string
          finished_at?: string | null
          hard_case_regressions?: Json
          id?: string
          metrics?: Json
          policy_version: string
          started_at?: string
          status: string
        }
        Update: {
          case_count?: number
          created_at?: string
          finished_at?: string | null
          hard_case_regressions?: Json
          id?: string
          metrics?: Json
          policy_version?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      world_change_sets: {
        Row: {
          branch: string
          checkpoint_status: string
          commit_sha: string
          committed_at: string
          error: string | null
          event_cluster_ids: Json
          id: string
          is_canonical: boolean
          lead_status: string
          projection_status: string
          thinker_run_id: string | null
          updated_at: string
        }
        Insert: {
          branch: string
          checkpoint_status?: string
          commit_sha: string
          committed_at?: string
          error?: string | null
          event_cluster_ids?: Json
          id?: string
          is_canonical?: boolean
          lead_status?: string
          projection_status?: string
          thinker_run_id?: string | null
          updated_at?: string
        }
        Update: {
          branch?: string
          checkpoint_status?: string
          commit_sha?: string
          committed_at?: string
          error?: string | null
          event_cluster_ids?: Json
          id?: string
          is_canonical?: boolean
          lead_status?: string
          projection_status?: string
          thinker_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_change_sets_thinker_run_id_fkey"
            columns: ["thinker_run_id"]
            isOneToOne: false
            referencedRelation: "world_thinker_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      world_claim_memberships: {
        Row: {
          claim_id: string
          commit_sha: string
          node_id: string
          revision_id: string
        }
        Insert: {
          claim_id: string
          commit_sha: string
          node_id: string
          revision_id: string
        }
        Update: {
          claim_id?: string
          commit_sha?: string
          node_id?: string
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_claim_memberships_commit_sha_fkey"
            columns: ["commit_sha"]
            isOneToOne: false
            referencedRelation: "world_memory_snapshots"
            referencedColumns: ["commit_sha"]
          },
          {
            foreignKeyName: "world_claim_memberships_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "world_claim_revisions"
            referencedColumns: ["revision_id"]
          },
        ]
      }
      world_claim_observation_links: {
        Row: {
          observation_id: string
          revision_id: string
        }
        Insert: {
          observation_id: string
          revision_id: string
        }
        Update: {
          observation_id?: string
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_claim_observation_links_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "world_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_claim_observation_links_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "world_claim_revisions"
            referencedColumns: ["revision_id"]
          },
        ]
      }
      world_claim_revisions: {
        Row: {
          accepted_at: string
          claim_id: string
          content: Json
          evidence_origins: Json
          node_id: string
          revision_id: string
          sources: Json
        }
        Insert: {
          accepted_at?: string
          claim_id: string
          content: Json
          evidence_origins?: Json
          node_id: string
          revision_id: string
          sources?: Json
        }
        Update: {
          accepted_at?: string
          claim_id?: string
          content?: Json
          evidence_origins?: Json
          node_id?: string
          revision_id?: string
          sources?: Json
        }
        Relationships: []
      }
      world_coverage_frontiers: {
        Row: {
          active_node_ids: Json
          created_at: string
          description: string
          evidence_event_count: number
          id: string
          label: string
          last_evidence_at: string | null
          last_reviewed_at: string | null
          last_search_at: string | null
          next_review_at: string
          open_questions: Json
          priority: number
          query_terms: Json
          source_family_count: number
          status: string
          updated_at: string
          weak_signal_count: number
        }
        Insert: {
          active_node_ids?: Json
          created_at?: string
          description: string
          evidence_event_count?: number
          id: string
          label: string
          last_evidence_at?: string | null
          last_reviewed_at?: string | null
          last_search_at?: string | null
          next_review_at?: string
          open_questions?: Json
          priority?: number
          query_terms?: Json
          source_family_count?: number
          status?: string
          updated_at?: string
          weak_signal_count?: number
        }
        Update: {
          active_node_ids?: Json
          created_at?: string
          description?: string
          evidence_event_count?: number
          id?: string
          label?: string
          last_evidence_at?: string | null
          last_reviewed_at?: string | null
          last_search_at?: string | null
          next_review_at?: string
          open_questions?: Json
          priority?: number
          query_terms?: Json
          source_family_count?: number
          status?: string
          updated_at?: string
          weak_signal_count?: number
        }
        Relationships: []
      }
      world_documents: {
        Row: {
          archive_key: string | null
          backup_state: string
          canonical_url: string
          content_hash: string
          extracted_key: string | null
          extraction_status: string
          id: string
          ingested_at: string
          metadata: Json
          mime_type: string
          published_at: string | null
          publisher: string
          source_registry_id: string | null
          source_tier: string
          title: string
        }
        Insert: {
          archive_key?: string | null
          backup_state?: string
          canonical_url: string
          content_hash: string
          extracted_key?: string | null
          extraction_status?: string
          id?: string
          ingested_at?: string
          metadata?: Json
          mime_type?: string
          published_at?: string | null
          publisher: string
          source_registry_id?: string | null
          source_tier: string
          title: string
        }
        Update: {
          archive_key?: string | null
          backup_state?: string
          canonical_url?: string
          content_hash?: string
          extracted_key?: string | null
          extraction_status?: string
          id?: string
          ingested_at?: string
          metadata?: Json
          mime_type?: string
          published_at?: string | null
          publisher?: string
          source_registry_id?: string | null
          source_tier?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_documents_source_registry_id_fkey"
            columns: ["source_registry_id"]
            isOneToOne: false
            referencedRelation: "world_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      world_entities: {
        Row: {
          aliases: Json
          canonical_name: string
          created_at: string
          id: string
          kind: string
          metadata: Json
          updated_at: string
        }
        Insert: {
          aliases?: Json
          canonical_name: string
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          updated_at?: string
        }
        Update: {
          aliases?: Json
          canonical_name?: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
      world_event_cluster_sources: {
        Row: {
          claim_state: string
          cluster_id: string
          created_at: string
          document_id: string | null
          feed_item_id: string | null
          published_at: string | null
          publisher: string | null
          source_family: string | null
          source_id: string
          source_lane: string | null
          stance: string
          title: string
          url: string
        }
        Insert: {
          claim_state: string
          cluster_id: string
          created_at?: string
          document_id?: string | null
          feed_item_id?: string | null
          published_at?: string | null
          publisher?: string | null
          source_family?: string | null
          source_id: string
          source_lane?: string | null
          stance?: string
          title: string
          url: string
        }
        Update: {
          claim_state?: string
          cluster_id?: string
          created_at?: string
          document_id?: string | null
          feed_item_id?: string | null
          published_at?: string | null
          publisher?: string | null
          source_family?: string | null
          source_id?: string
          source_lane?: string | null
          stance?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_event_cluster_sources_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "world_event_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      world_event_clusters: {
        Row: {
          actors: Json
          attention_dimensions: Json
          attention_reasons: Json
          attention_route: string | null
          channels: Json
          claim_state: string
          created_at: string
          decisive_new_event: boolean
          enrichment_status: string
          event_at: string | null
          fingerprint: string
          first_seen_at: string
          geographies: Json
          id: string
          last_attempt_at: string | null
          last_seen_at: string
          lease_expires_at: string | null
          lease_run_id: string | null
          materiality: number
          next_attempt_at: string | null
          novelty: number
          policy_version: string | null
          portfolio_dependency: boolean
          processed_at: string | null
          processing_attempts: number
          processing_error: string | null
          processing_state: string
          quarantined_at: string | null
          source_diversity: number
          source_ids: Json
          source_lane: string | null
          specialist_lenses: Json
          summary: string
          thesis_dependency: boolean
          title: string
          triaged_at: string | null
          updated_at: string
        }
        Insert: {
          actors?: Json
          attention_dimensions?: Json
          attention_reasons?: Json
          attention_route?: string | null
          channels?: Json
          claim_state: string
          created_at?: string
          decisive_new_event?: boolean
          enrichment_status?: string
          event_at?: string | null
          fingerprint: string
          first_seen_at: string
          geographies?: Json
          id?: string
          last_attempt_at?: string | null
          last_seen_at: string
          lease_expires_at?: string | null
          lease_run_id?: string | null
          materiality: number
          next_attempt_at?: string | null
          novelty: number
          policy_version?: string | null
          portfolio_dependency?: boolean
          processed_at?: string | null
          processing_attempts?: number
          processing_error?: string | null
          processing_state?: string
          quarantined_at?: string | null
          source_diversity?: number
          source_ids?: Json
          source_lane?: string | null
          specialist_lenses?: Json
          summary: string
          thesis_dependency?: boolean
          title: string
          triaged_at?: string | null
          updated_at?: string
        }
        Update: {
          actors?: Json
          attention_dimensions?: Json
          attention_reasons?: Json
          attention_route?: string | null
          channels?: Json
          claim_state?: string
          created_at?: string
          decisive_new_event?: boolean
          enrichment_status?: string
          event_at?: string | null
          fingerprint?: string
          first_seen_at?: string
          geographies?: Json
          id?: string
          last_attempt_at?: string | null
          last_seen_at?: string
          lease_expires_at?: string | null
          lease_run_id?: string | null
          materiality?: number
          next_attempt_at?: string | null
          novelty?: number
          policy_version?: string | null
          portfolio_dependency?: boolean
          processed_at?: string | null
          processing_attempts?: number
          processing_error?: string | null
          processing_state?: string
          quarantined_at?: string | null
          source_diversity?: number
          source_ids?: Json
          source_lane?: string | null
          specialist_lenses?: Json
          summary?: string
          thesis_dependency?: boolean
          title?: string
          triaged_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_event_clusters_lease_run_id_fkey"
            columns: ["lease_run_id"]
            isOneToOne: false
            referencedRelation: "world_thinker_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      world_file_index: {
        Row: {
          aliases: Json
          as_of: string
          commit_sha: string
          confidence: number
          file_path: string
          importance: number
          kind: string
          next_review_at: string
          node_id: string
          projected_at: string
          relationships: Json
          search_text: string
          source_ids: Json
          status: string
          structured_content: Json
          summary: string
          title: string
        }
        Insert: {
          aliases?: Json
          as_of: string
          commit_sha: string
          confidence: number
          file_path: string
          importance: number
          kind: string
          next_review_at: string
          node_id: string
          projected_at?: string
          relationships?: Json
          search_text: string
          source_ids?: Json
          status: string
          structured_content: Json
          summary: string
          title: string
        }
        Update: {
          aliases?: Json
          as_of?: string
          commit_sha?: string
          confidence?: number
          file_path?: string
          importance?: number
          kind?: string
          next_review_at?: string
          node_id?: string
          projected_at?: string
          relationships?: Json
          search_text?: string
          source_ids?: Json
          status?: string
          structured_content?: Json
          summary?: string
          title?: string
        }
        Relationships: []
      }
      world_investigation_slots: {
        Row: {
          consumed_at: string
          day: string
          lane: string
          question: Json
          run_id: string
          slot: number
        }
        Insert: {
          consumed_at?: string
          day: string
          lane: string
          question: Json
          run_id: string
          slot: number
        }
        Update: {
          consumed_at?: string
          day?: string
          lane?: string
          question?: Json
          run_id?: string
          slot?: number
        }
        Relationships: [
          {
            foreignKeyName: "world_investigation_slots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "world_thinker_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      world_memory_snapshots: {
        Row: {
          accepted_at: string
          branch: string
          commit_sha: string
          sources: Json
        }
        Insert: {
          accepted_at?: string
          branch: string
          commit_sha: string
          sources: Json
        }
        Update: {
          accepted_at?: string
          branch?: string
          commit_sha?: string
          sources?: Json
        }
        Relationships: []
      }
      world_observation_entities: {
        Row: {
          entity_id: string
          observation_id: string
        }
        Insert: {
          entity_id: string
          observation_id: string
        }
        Update: {
          entity_id?: string
          observation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_observation_entities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_observation_entities_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "world_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      world_observation_proposal_reviews: {
        Row: {
          decision: string
          observation_id: string | null
          proposal_id: string
          rationale: string
          reviewed_at: string
          reviewer_id: string
          reviewer_kind: string
        }
        Insert: {
          decision: string
          observation_id?: string | null
          proposal_id: string
          rationale: string
          reviewed_at?: string
          reviewer_id: string
          reviewer_kind?: string
        }
        Update: {
          decision?: string
          observation_id?: string | null
          proposal_id?: string
          rationale?: string
          reviewed_at?: string
          reviewer_id?: string
          reviewer_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_observation_proposal_reviews_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "world_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_observation_proposal_reviews_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "world_observation_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_observation_proposal_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
        ]
      }
      world_observation_proposal_triage_runs: {
        Row: {
          completed_at: string
          error: string | null
          id: string
          model: string | null
          proposal_count: number
          provider: string | null
          source_capture_id: string
          status: string
        }
        Insert: {
          completed_at?: string
          error?: string | null
          id?: string
          model?: string | null
          proposal_count?: number
          provider?: string | null
          source_capture_id: string
          status: string
        }
        Update: {
          completed_at?: string
          error?: string | null
          id?: string
          model?: string | null
          proposal_count?: number
          provider?: string | null
          source_capture_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_observation_proposal_triage_runs_source_capture_id_fkey"
            columns: ["source_capture_id"]
            isOneToOne: false
            referencedRelation: "world_source_document_captures"
            referencedColumns: ["id"]
          },
        ]
      }
      world_observation_proposals: {
        Row: {
          assertion: string
          confidence: number
          document_id: string
          domain_id: string
          evidence_quote: string
          fingerprint: string
          generated_at: string
          id: string
          materiality: number
          mechanism: string
          metadata: Json
          model: string | null
          novelty: number
          observation_kind: string
          provider: string | null
          source_capture_id: string
          source_id: string
        }
        Insert: {
          assertion: string
          confidence: number
          document_id: string
          domain_id: string
          evidence_quote: string
          fingerprint: string
          generated_at?: string
          id?: string
          materiality: number
          mechanism: string
          metadata?: Json
          model?: string | null
          novelty: number
          observation_kind: string
          provider?: string | null
          source_capture_id: string
          source_id: string
        }
        Update: {
          assertion?: string
          confidence?: number
          document_id?: string
          domain_id?: string
          evidence_quote?: string
          fingerprint?: string
          generated_at?: string
          id?: string
          materiality?: number
          mechanism?: string
          metadata?: Json
          model?: string | null
          novelty?: number
          observation_kind?: string
          provider?: string | null
          source_capture_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_observation_proposals_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "world_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_observation_proposals_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "market_domain_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_observation_proposals_source_capture_id_fkey"
            columns: ["source_capture_id"]
            isOneToOne: false
            referencedRelation: "world_source_document_captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_observation_proposals_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "world_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      world_observations: {
        Row: {
          assertion: string
          confidence: number
          decay_hours: number | null
          document_id: string
          domain: string
          fingerprint: string
          geography: string | null
          id: string
          ingested_at: string
          materiality: number
          mechanism: string
          metadata: Json
          novelty: number
          numeric_unit: string | null
          numeric_value: number | null
          observation_kind: string
          observed_at: string | null
          published_at: string | null
          supersedes_id: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          assertion: string
          confidence: number
          decay_hours?: number | null
          document_id: string
          domain: string
          fingerprint: string
          geography?: string | null
          id?: string
          ingested_at?: string
          materiality: number
          mechanism: string
          metadata?: Json
          novelty: number
          numeric_unit?: string | null
          numeric_value?: number | null
          observation_kind: string
          observed_at?: string | null
          published_at?: string | null
          supersedes_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          assertion?: string
          confidence?: number
          decay_hours?: number | null
          document_id?: string
          domain?: string
          fingerprint?: string
          geography?: string | null
          id?: string
          ingested_at?: string
          materiality?: number
          mechanism?: string
          metadata?: Json
          novelty?: number
          numeric_unit?: string | null
          numeric_value?: number | null
          observation_kind?: string
          observed_at?: string | null
          published_at?: string | null
          supersedes_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "world_observations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "world_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_observations_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "world_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      world_opportunity_leads: {
        Row: {
          capture_conditions: Json
          capture_mechanism: string
          capture_plausibility: number
          catalysts: Json
          contradicting_source_ids: Json
          created_at: string
          decisive_new_event: boolean
          decisive_questions: Json
          dismissal_reason: string | null
          evidence_gaps: Json
          evidence_readiness: number
          expectations_gap: number
          expectations_question: string
          falsifiers: Json
          id: string
          investability: number
          investigated_by: string | null
          issuer: string
          materiality: number
          originating_hypothesis_id: string
          originating_node_id: string
          portfolio_relevance: number
          research_job_id: string | null
          research_note_id: string | null
          status: string
          supporting_source_ids: Json
          symbol: string
          transmission_confidence: number
          transmission_mechanism: string
          updated_at: string
          value_chain_role: string
          what_changed: string
          why_now: string
          world_commit: string
        }
        Insert: {
          capture_conditions?: Json
          capture_mechanism: string
          capture_plausibility: number
          catalysts?: Json
          contradicting_source_ids?: Json
          created_at?: string
          decisive_new_event?: boolean
          decisive_questions?: Json
          dismissal_reason?: string | null
          evidence_gaps?: Json
          evidence_readiness: number
          expectations_gap: number
          expectations_question: string
          falsifiers?: Json
          id: string
          investability: number
          investigated_by?: string | null
          issuer: string
          materiality: number
          originating_hypothesis_id: string
          originating_node_id: string
          portfolio_relevance: number
          research_job_id?: string | null
          research_note_id?: string | null
          status?: string
          supporting_source_ids?: Json
          symbol: string
          transmission_confidence: number
          transmission_mechanism: string
          updated_at?: string
          value_chain_role: string
          what_changed: string
          why_now: string
          world_commit: string
        }
        Update: {
          capture_conditions?: Json
          capture_mechanism?: string
          capture_plausibility?: number
          catalysts?: Json
          contradicting_source_ids?: Json
          created_at?: string
          decisive_new_event?: boolean
          decisive_questions?: Json
          dismissal_reason?: string | null
          evidence_gaps?: Json
          evidence_readiness?: number
          expectations_gap?: number
          expectations_question?: string
          falsifiers?: Json
          id?: string
          investability?: number
          investigated_by?: string | null
          issuer?: string
          materiality?: number
          originating_hypothesis_id?: string
          originating_node_id?: string
          portfolio_relevance?: number
          research_job_id?: string | null
          research_note_id?: string | null
          status?: string
          supporting_source_ids?: Json
          symbol?: string
          transmission_confidence?: number
          transmission_mechanism?: string
          updated_at?: string
          value_chain_role?: string
          what_changed?: string
          why_now?: string
          world_commit?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_opportunity_leads_investigated_by_fkey"
            columns: ["investigated_by"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_opportunity_leads_research_job_id_fkey"
            columns: ["research_job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_opportunity_leads_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "market_assets"
            referencedColumns: ["symbol"]
          },
        ]
      }
      world_policy_experiments: {
        Row: {
          baseline_metrics: Json
          baseline_version: string
          candidate_metrics: Json
          candidate_version: string
          created_at: string
          ends_at: string
          failure_reason: string | null
          finished_at: string | null
          hard_case_regressions: Json
          id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          baseline_metrics?: Json
          baseline_version: string
          candidate_metrics?: Json
          candidate_version: string
          created_at?: string
          ends_at: string
          failure_reason?: string | null
          finished_at?: string | null
          hard_case_regressions?: Json
          id?: string
          started_at?: string
          status: string
          updated_at?: string
        }
        Update: {
          baseline_metrics?: Json
          baseline_version?: string
          candidate_metrics?: Json
          candidate_version?: string
          created_at?: string
          ends_at?: string
          failure_reason?: string | null
          finished_at?: string | null
          hard_case_regressions?: Json
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_policy_experiments_baseline_version_fkey"
            columns: ["baseline_version"]
            isOneToOne: false
            referencedRelation: "world_attention_policy_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "world_policy_experiments_candidate_version_fkey"
            columns: ["candidate_version"]
            isOneToOne: false
            referencedRelation: "world_attention_policy_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      world_relationships: {
        Row: {
          confidence: number
          created_at: string
          evidence_observation_id: string | null
          from_entity_id: string
          id: string
          metadata: Json
          relationship_type: string
          to_entity_id: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          evidence_observation_id?: string | null
          from_entity_id: string
          id?: string
          metadata?: Json
          relationship_type: string
          to_entity_id: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          evidence_observation_id?: string | null
          from_entity_id?: string
          id?: string
          metadata?: Json
          relationship_type?: string
          to_entity_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "world_relationships_evidence_observation_id_fkey"
            columns: ["evidence_observation_id"]
            isOneToOne: false
            referencedRelation: "world_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_relationships_from_entity_id_fkey"
            columns: ["from_entity_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_relationships_to_entity_id_fkey"
            columns: ["to_entity_id"]
            isOneToOne: false
            referencedRelation: "world_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      world_replay_batches: {
        Row: {
          attempt_count: number
          batch_index: number
          cluster_count: number
          created_at: string
          error: string | null
          event_cluster_ids: Json
          event_cursor: number
          finished_at: string | null
          historical_gap_search_attempted: boolean
          id: string
          last_progress_at: string | null
          outcome: string | null
          recovery_count: number
          replay_run_id: string
          result_commits: Json
          source_count: number
          source_families: Json
          source_ids: Json
          source_urls: Json
          started_at: string | null
          status: string
          thinker_run_ids: Json
          updated_at: string
          used_deterministic_fallback: boolean
          used_historical_gap_search: boolean
          week_end: string
          week_start: string
        }
        Insert: {
          attempt_count?: number
          batch_index?: number
          cluster_count?: number
          created_at?: string
          error?: string | null
          event_cluster_ids?: Json
          event_cursor?: number
          finished_at?: string | null
          historical_gap_search_attempted?: boolean
          id?: string
          last_progress_at?: string | null
          outcome?: string | null
          recovery_count?: number
          replay_run_id: string
          result_commits?: Json
          source_count?: number
          source_families?: Json
          source_ids?: Json
          source_urls?: Json
          started_at?: string | null
          status?: string
          thinker_run_ids?: Json
          updated_at?: string
          used_deterministic_fallback?: boolean
          used_historical_gap_search?: boolean
          week_end: string
          week_start: string
        }
        Update: {
          attempt_count?: number
          batch_index?: number
          cluster_count?: number
          created_at?: string
          error?: string | null
          event_cluster_ids?: Json
          event_cursor?: number
          finished_at?: string | null
          historical_gap_search_attempted?: boolean
          id?: string
          last_progress_at?: string | null
          outcome?: string | null
          recovery_count?: number
          replay_run_id?: string
          result_commits?: Json
          source_count?: number
          source_families?: Json
          source_ids?: Json
          source_urls?: Json
          started_at?: string | null
          status?: string
          thinker_run_ids?: Json
          updated_at?: string
          used_deterministic_fallback?: boolean
          used_historical_gap_search?: boolean
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_replay_batches_replay_run_id_fkey"
            columns: ["replay_run_id"]
            isOneToOne: false
            referencedRelation: "world_replay_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      world_replay_runs: {
        Row: {
          branch: string
          clusters_retained: number
          created_at: string
          cursor_at: string
          error: string | null
          finished_at: string | null
          id: string
          search_gap_weeks: number
          since_at: string
          sources_scanned: number
          started_at: string | null
          status: string
          until_at: string
          updated_at: string
          weeks_completed: number
          weeks_projected: number
          weeks_total: number
          weeks_uncovered: number
          weeks_verified: number
        }
        Insert: {
          branch?: string
          clusters_retained?: number
          created_at?: string
          cursor_at: string
          error?: string | null
          finished_at?: string | null
          id?: string
          search_gap_weeks?: number
          since_at: string
          sources_scanned?: number
          started_at?: string | null
          status?: string
          until_at: string
          updated_at?: string
          weeks_completed?: number
          weeks_projected?: number
          weeks_total?: number
          weeks_uncovered?: number
          weeks_verified?: number
        }
        Update: {
          branch?: string
          clusters_retained?: number
          created_at?: string
          cursor_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          search_gap_weeks?: number
          since_at?: string
          sources_scanned?: number
          started_at?: string | null
          status?: string
          until_at?: string
          updated_at?: string
          weeks_completed?: number
          weeks_projected?: number
          weeks_total?: number
          weeks_uncovered?: number
          weeks_verified?: number
        }
        Relationships: []
      }
      world_repository_projections: {
        Row: {
          branch: string
          commit_sha: string
          error: string | null
          file_count: number
          is_canonical: boolean
          projected_at: string
        }
        Insert: {
          branch: string
          commit_sha: string
          error?: string | null
          file_count: number
          is_canonical?: boolean
          projected_at?: string
        }
        Update: {
          branch?: string
          commit_sha?: string
          error?: string | null
          file_count?: number
          is_canonical?: boolean
          projected_at?: string
        }
        Relationships: []
      }
      world_review_labels: {
        Row: {
          category: string
          created_at: string
          id: string
          label: string
          notes: string | null
          owner_id: string
          review_week: string
          subject_id: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          label: string
          notes?: string | null
          owner_id: string
          review_week: string
          subject_id: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          label?: string
          notes?: string | null
          owner_id?: string
          review_week?: string
          subject_id?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_review_labels_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
        ]
      }
      world_signal_links: {
        Row: {
          activation_satisfied: boolean
          created_at: string
          event_cluster_id: string | null
          id: string
          match_dimensions: Json
          rationale: string
          source_signal_id: string
          target_signal_id: string
        }
        Insert: {
          activation_satisfied?: boolean
          created_at?: string
          event_cluster_id?: string | null
          id?: string
          match_dimensions: Json
          rationale: string
          source_signal_id: string
          target_signal_id: string
        }
        Update: {
          activation_satisfied?: boolean
          created_at?: string
          event_cluster_id?: string | null
          id?: string
          match_dimensions?: Json
          rationale?: string
          source_signal_id?: string
          target_signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_signal_links_event_cluster_id_fkey"
            columns: ["event_cluster_id"]
            isOneToOne: false
            referencedRelation: "world_event_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_signal_links_source_signal_id_fkey"
            columns: ["source_signal_id"]
            isOneToOne: false
            referencedRelation: "world_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_signal_links_target_signal_id_fkey"
            columns: ["target_signal_id"]
            isOneToOne: false
            referencedRelation: "world_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      world_signals: {
        Row: {
          activation_conditions: Json
          created_at: string
          domains: Json
          economic_channels: Json
          entities: Json
          event_cluster_ids: Json
          fingerprint: string
          first_observed_at: string
          geographies: Json
          id: string
          last_matched_at: string | null
          last_observed_at: string
          next_review_at: string
          related_node_ids: Json
          related_signal_ids: Json
          search_text: string
          search_vector: unknown
          source_ids: Json
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          activation_conditions?: Json
          created_at?: string
          domains?: Json
          economic_channels?: Json
          entities?: Json
          event_cluster_ids?: Json
          fingerprint: string
          first_observed_at: string
          geographies?: Json
          id: string
          last_matched_at?: string | null
          last_observed_at: string
          next_review_at: string
          related_node_ids?: Json
          related_signal_ids?: Json
          search_text: string
          search_vector?: unknown
          source_ids?: Json
          status: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          activation_conditions?: Json
          created_at?: string
          domains?: Json
          economic_channels?: Json
          entities?: Json
          event_cluster_ids?: Json
          fingerprint?: string
          first_observed_at?: string
          geographies?: Json
          id?: string
          last_matched_at?: string | null
          last_observed_at?: string
          next_review_at?: string
          related_node_ids?: Json
          related_signal_ids?: Json
          search_text?: string
          search_vector?: unknown
          source_ids?: Json
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      world_source_canonical_revisions: {
        Row: {
          canonical_url: string
          id: string
          previous_canonical_url: string
          rationale: string
          reviewer_id: string
          revised_at: string
          source_id: string
        }
        Insert: {
          canonical_url: string
          id?: string
          previous_canonical_url: string
          rationale: string
          reviewer_id: string
          revised_at?: string
          source_id: string
        }
        Update: {
          canonical_url?: string
          id?: string
          previous_canonical_url?: string
          rationale?: string
          reviewer_id?: string
          revised_at?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_source_canonical_revisions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "market_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_source_canonical_revisions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "world_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      world_source_contract_versions: {
        Row: {
          accepted_mime_types: Json
          allowed_hosts: Json
          allowed_paths: Json
          assertions_allowed: Json
          cadence: string
          created_at: string
          id: string
          notes: string
          retention_days: number | null
          source_id: string
          status: string
          version: number
        }
        Insert: {
          accepted_mime_types?: Json
          allowed_hosts?: Json
          allowed_paths?: Json
          assertions_allowed?: Json
          cadence: string
          created_at?: string
          id?: string
          notes?: string
          retention_days?: number | null
          source_id: string
          status: string
          version: number
        }
        Update: {
          accepted_mime_types?: Json
          allowed_hosts?: Json
          allowed_paths?: Json
          assertions_allowed?: Json
          cadence?: string
          created_at?: string
          id?: string
          notes?: string
          retention_days?: number | null
          source_id?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "world_source_contract_versions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "world_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      world_source_discovery_runs: {
        Row: {
          candidates: Json
          created_at: string
          domain_id: string
          error: string | null
          frontier_ids: Json
          generated_at: string | null
          id: string
          model: string | null
          provider: string | null
          reason: string
          requested_at: string
          status: string
          trigger: string
        }
        Insert: {
          candidates?: Json
          created_at?: string
          domain_id: string
          error?: string | null
          frontier_ids?: Json
          generated_at?: string | null
          id?: string
          model?: string | null
          provider?: string | null
          reason: string
          requested_at?: string
          status: string
          trigger: string
        }
        Update: {
          candidates?: Json
          created_at?: string
          domain_id?: string
          error?: string | null
          frontier_ids?: Json
          generated_at?: string | null
          id?: string
          model?: string | null
          provider?: string | null
          reason?: string
          requested_at?: string
          status?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_source_discovery_runs_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "market_domain_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      world_source_document_captures: {
        Row: {
          byte_count: number | null
          canonical_url: string
          captured_at: string
          content_hash: string | null
          contract_version: number
          document_id: string | null
          domain_ids: Json
          error: string | null
          http_status: number | null
          id: string
          metadata: Json
          mime_type: string | null
          resolved_url: string | null
          source_id: string
          status: string
        }
        Insert: {
          byte_count?: number | null
          canonical_url: string
          captured_at?: string
          content_hash?: string | null
          contract_version: number
          document_id?: string | null
          domain_ids?: Json
          error?: string | null
          http_status?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          resolved_url?: string | null
          source_id: string
          status: string
        }
        Update: {
          byte_count?: number | null
          canonical_url?: string
          captured_at?: string
          content_hash?: string | null
          contract_version?: number
          document_id?: string | null
          domain_ids?: Json
          error?: string | null
          http_status?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          resolved_url?: string | null
          source_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_source_document_captures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "world_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_source_document_captures_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "world_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      world_source_domains: {
        Row: {
          domain_id: string
          role: string
          source_id: string
        }
        Insert: {
          domain_id: string
          role: string
          source_id: string
        }
        Update: {
          domain_id?: string
          role?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_source_domains_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "market_domain_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_source_domains_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "world_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      world_source_health_checks: {
        Row: {
          canonical_url: string
          checked_at: string
          error: string | null
          http_status: number | null
          id: string
          latency_ms: number | null
          mime_type: string | null
          resolved_url: string | null
          source_id: string
          status: string
        }
        Insert: {
          canonical_url: string
          checked_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          mime_type?: string | null
          resolved_url?: string | null
          source_id: string
          status: string
        }
        Update: {
          canonical_url?: string
          checked_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          mime_type?: string | null
          resolved_url?: string | null
          source_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_source_health_checks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "world_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      world_source_referrals: {
        Row: {
          created_at: string
          dismissal_reason: string | null
          dismissed_at: string | null
          domain_id: string
          feed_item_id: string
          feed_scope: string
          feed_section: string
          id: string
          origin_url: string
          published_at: string | null
          publisher: string | null
          reason: string
          registered_at: string | null
          registered_source_id: string | null
          review_rationale: string | null
          reviewed_by: string | null
          source_url: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dismissal_reason?: string | null
          dismissed_at?: string | null
          domain_id: string
          feed_item_id: string
          feed_scope: string
          feed_section: string
          id?: string
          origin_url: string
          published_at?: string | null
          publisher?: string | null
          reason: string
          registered_at?: string | null
          registered_source_id?: string | null
          review_rationale?: string | null
          reviewed_by?: string | null
          source_url: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dismissal_reason?: string | null
          dismissed_at?: string | null
          domain_id?: string
          feed_item_id?: string
          feed_scope?: string
          feed_section?: string
          id?: string
          origin_url?: string
          published_at?: string | null
          publisher?: string | null
          reason?: string
          registered_at?: string | null
          registered_source_id?: string | null
          review_rationale?: string | null
          reviewed_by?: string | null
          source_url?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_source_referrals_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "market_domain_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_source_referrals_registered_source_id_fkey"
            columns: ["registered_source_id"]
            isOneToOne: false
            referencedRelation: "world_source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      world_source_registry: {
        Row: {
          approved_at: string | null
          blocked_reason: string | null
          canonical_url: string
          created_at: string
          discovered_by: string
          discovery_run_id: string | null
          evidence_classes: Json
          id: string
          label: string
          metadata: Json
          publisher: string
          slug: string
          source_kind: string
          source_tier: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          blocked_reason?: string | null
          canonical_url: string
          created_at?: string
          discovered_by: string
          discovery_run_id?: string | null
          evidence_classes?: Json
          id?: string
          label: string
          metadata?: Json
          publisher: string
          slug: string
          source_kind: string
          source_tier: string
          status: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          blocked_reason?: string | null
          canonical_url?: string
          created_at?: string
          discovered_by?: string
          discovery_run_id?: string | null
          evidence_classes?: Json
          id?: string
          label?: string
          metadata?: Json
          publisher?: string
          slug?: string
          source_kind?: string
          source_tier?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_source_registry_discovery_run_id_fkey"
            columns: ["discovery_run_id"]
            isOneToOne: false
            referencedRelation: "world_source_discovery_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      world_specialist_assessments: {
        Row: {
          assessment: Json
          created_at: string
          event_cluster_ids: Json
          id: string
          lens: string
          model_metadata: Json
          source_ids: Json
          thinker_run_id: string | null
        }
        Insert: {
          assessment: Json
          created_at?: string
          event_cluster_ids?: Json
          id?: string
          lens: string
          model_metadata?: Json
          source_ids?: Json
          thinker_run_id?: string | null
        }
        Update: {
          assessment?: Json
          created_at?: string
          event_cluster_ids?: Json
          id?: string
          lens?: string
          model_metadata?: Json
          source_ids?: Json
          thinker_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "world_specialist_assessments_thinker_run_id_fkey"
            columns: ["thinker_run_id"]
            isOneToOne: false
            referencedRelation: "world_thinker_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      world_thinker_runs: {
        Row: {
          agent_job_id: string | null
          base_commit: string | null
          branch: string
          checkpoint: string | null
          context_manifest: Json
          cost_metadata: Json
          created_at: string
          critic_verdict: string | null
          error: string | null
          finished_at: string | null
          id: string
          model_metadata: Json
          opportunity_lead_count: number
          outcome_reason: string | null
          projection_status: string
          push_pending: boolean
          research_queued_count: number
          result_commit: string | null
          retrieval_ledger: Json
          started_at: string
          status: string
          trigger: string
          updated_at: string
        }
        Insert: {
          agent_job_id?: string | null
          base_commit?: string | null
          branch?: string
          checkpoint?: string | null
          context_manifest?: Json
          cost_metadata?: Json
          created_at?: string
          critic_verdict?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          model_metadata?: Json
          opportunity_lead_count?: number
          outcome_reason?: string | null
          projection_status?: string
          push_pending?: boolean
          research_queued_count?: number
          result_commit?: string | null
          retrieval_ledger?: Json
          started_at?: string
          status?: string
          trigger: string
          updated_at?: string
        }
        Update: {
          agent_job_id?: string | null
          base_commit?: string | null
          branch?: string
          checkpoint?: string | null
          context_manifest?: Json
          cost_metadata?: Json
          created_at?: string
          critic_verdict?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          model_metadata?: Json
          opportunity_lead_count?: number
          outcome_reason?: string | null
          projection_status?: string
          push_pending?: boolean
          research_queued_count?: number
          result_commit?: string | null
          retrieval_ledger?: Json
          started_at?: string
          status?: string
          trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_thinker_runs_agent_job_id_fkey"
            columns: ["agent_job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_world_observation_proposal: {
        Args: {
          p_fingerprint: string
          p_metadata?: Json
          p_proposal_id: string
          p_rationale: string
          p_reviewer_id: string
        }
        Returns: string
      }
      acquire_world_investigation_slot: {
        Args: {
          p_lane?: string
          p_now?: string
          p_question?: Json
          p_run_id?: string
        }
        Returns: {
          available: boolean
          lane: string
          slot: number
        }[]
      }
      activate_world_source_contract: {
        Args: {
          p_accepted_mime_types: Json
          p_allowed_hosts: Json
          p_allowed_paths: Json
          p_approval_reason: string
          p_assertions_allowed: Json
          p_cadence: string
          p_notes: string
          p_retention_days: number
          p_source_id: string
        }
        Returns: {
          approved_at: string | null
          blocked_reason: string | null
          canonical_url: string
          created_at: string
          discovered_by: string
          discovery_run_id: string | null
          evidence_classes: Json
          id: string
          label: string
          metadata: Json
          publisher: string
          slug: string
          source_kind: string
          source_tier: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "world_source_registry"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      backfill_company_world_reports: { Args: never; Returns: Json }
      claim_agent_job: {
        Args: { p_worker_id: string }
        Returns: {
          attempts: number
          blocked_on: Json | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          payload: Json
          priority: number
          run_after: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_company_world_receipt: {
        Args: { p_job: string; p_report: string }
        Returns: {
          affected_claim_ids: Json
          affected_node_ids: Json
          attempts: number
          context_node_ids: Json
          created_at: string
          evidence_gaps: Json
          explanation: string | null
          finished_at: string | null
          job_id: string | null
          origin: string
          originating_lead_id: string | null
          owner_id: string
          report_id: string
          result_commit: string | null
          run_id: string | null
          started_at: string | null
          status: string
          symbol: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "company_world_memory_receipts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_investment_newsletter: {
        Args: { p_outbox_id: string }
        Returns: boolean
      }
      claim_world_event_clusters: {
        Args: {
          p_event_ids: string[]
          p_lease_seconds?: number
          p_run_id: string
        }
        Returns: {
          actors: Json
          attention_dimensions: Json
          attention_reasons: Json
          attention_route: string | null
          channels: Json
          claim_state: string
          created_at: string
          decisive_new_event: boolean
          enrichment_status: string
          event_at: string | null
          fingerprint: string
          first_seen_at: string
          geographies: Json
          id: string
          last_attempt_at: string | null
          last_seen_at: string
          lease_expires_at: string | null
          lease_run_id: string | null
          materiality: number
          next_attempt_at: string | null
          novelty: number
          policy_version: string | null
          portfolio_dependency: boolean
          processed_at: string | null
          processing_attempts: number
          processing_error: string | null
          processing_state: string
          quarantined_at: string | null
          source_diversity: number
          source_ids: Json
          source_lane: string | null
          specialist_lenses: Json
          summary: string
          thesis_dependency: boolean
          title: string
          triaged_at: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "world_event_clusters"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dismiss_world_source_referral: {
        Args: {
          p_rationale: string
          p_referral_id: string
          p_reviewer_id: string
        }
        Returns: undefined
      }
      finish_agent_attempt: {
        Args: {
          p_duration_ms: number
          p_error: string
          p_job_id: string
          p_output: Json
          p_run_after: string
          p_run_id: string
          p_success: boolean
          p_worker_id: string
        }
        Returns: undefined
      }
      freeze_recommendation_input: {
        Args: { p_manifest: Json }
        Returns: string
      }
      index_company_world_report: {
        Args: { p_origin?: string; p_report: string }
        Returns: undefined
      }
      market_history_cursors: {
        Args: { p_feed: string; p_symbols: string[] }
        Returns: {
          bar_count: number
          history_through: string
          symbol: string
        }[]
      }
      merge_research_interest_memberships: {
        Args: { p_members: Json; p_owner_id: string }
        Returns: undefined
      }
      promote_world_attention_policy: {
        Args: { p_version: string }
        Returns: {
          activated_at: string | null
          change_summary: string
          created_at: string
          created_by: string | null
          id: string
          parent_version: string | null
          policy: Json
          status: string
          updated_at: string
          version: string
        }
        SetofOptions: {
          from: "*"
          to: "world_attention_policy_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      promote_world_repository_projection: {
        Args: { p_commit_sha: string }
        Returns: {
          branch: string
          commit_sha: string
          error: string | null
          file_count: number
          is_canonical: boolean
          projected_at: string
        }
        SetofOptions: {
          from: "*"
          to: "world_repository_projections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prune_market_snapshot_slice: { Args: { p_before: string }; Returns: Json }
      publish_cross_asset_snapshot: {
        Args: { p_expected_count?: number; p_snapshot_id: string }
        Returns: {
          created_at: string
          data_as_of: string | null
          error: string | null
          id: string
          is_latest: boolean
          observation_count: number
          published_at: string | null
          retrieved_at: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "cross_asset_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_market_leadership_snapshot: {
        Args: { p_snapshot_id: string }
        Returns: {
          above_50_day_percent: number | null
          advancing_percent: number | null
          data_as_of: string
          error: string | null
          fresh_count: number
          generated_at: string
          id: string
          is_latest: boolean
          published_at: string | null
          status: string
          trading_date: string
          universe_count: number
          usable_count: number
        }
        SetofOptions: {
          from: "*"
          to: "market_leadership_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_recommendation_batch: {
        Args: {
          p_manifest_id: string
          p_metadata: Json
          p_recommendations: Json
          p_summary: string
        }
        Returns: string
      }
      publish_screener_snapshot: {
        Args: { p_snapshot_id: string }
        Returns: {
          created_at: string
          data_as_of: string
          error: string | null
          feed: string
          history_through: string | null
          id: string
          is_latest: boolean
          published_at: string | null
          row_count: number
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "market_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_world_memory_snapshot: {
        Args: {
          p_branch: string
          p_claims: Json
          p_commit: string
          p_sources: Json
        }
        Returns: undefined
      }
      recommendation_checkpoint_date: {
        Args: { p_horizon: string; p_issued: string }
        Returns: string
      }
      record_capital_decision: {
        Args: {
          p_change_summary: Json
          p_constraint_checks: Json
          p_constraint_data_as_of: string
          p_constraint_status: string
          p_conviction: number
          p_disposition: string
          p_entry_action: string
          p_entry_zone_high: number
          p_entry_zone_low: number
          p_fair_value: number
          p_formal_rating: string
          p_investment_thesis_id: string
          p_kill_criteria: Json
          p_next_catalyst: string
          p_owner_id: string
          p_portfolio_id: string
          p_price_at_decision: number
          p_rationale: string
          p_sizing_inputs: Json
          p_symbol: string
          p_valuation_support: string
          p_what_changed: string
        }
        Returns: {
          change_summary: Json
          constraint_status: string
          conviction: number | null
          created_at: string
          disposition: string
          entry_action: string
          entry_zone_high: number | null
          entry_zone_low: number | null
          fair_value: number | null
          formal_rating: string
          id: string
          investment_thesis_id: string | null
          kill_criteria: Json
          next_catalyst: string | null
          owner_id: string
          portfolio_id: string | null
          price_at_decision: number | null
          rationale: string
          research_note_id: string | null
          sizing_inputs: Json | null
          symbol: string
          valuation_support: string
          version: number
          what_changed: string
        }[]
        SetofOptions: {
          from: "*"
          to: "thesis_decisions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_investment_newsletter_event: {
        Args: {
          p_id: string
          p_occurred_at: string
          p_outbox_id: string
          p_status: string
        }
        Returns: undefined
      }
      record_reviewed_recommendation_trade: {
        Args: {
          p_occurred_at: string
          p_owner_id: string
          p_recommendation_id: string
          p_request_id: string
          p_trade: Json
        }
        Returns: string
      }
      register_world_source_referral: {
        Args: {
          p_rationale: string
          p_referral_id: string
          p_reviewer_id: string
        }
        Returns: string
      }
      replace_alpaca_asset_universe: {
        Args: { p_as_of: string; p_assets: Json }
        Returns: number
      }
      replace_market_universe: {
        Args: {
          p_source: string
          p_source_as_of: string
          p_symbols: string[]
          p_universe: string
        }
        Returns: number
      }
      reserve_research_investigation: {
        Args: {
          p_contract: number
          p_date: string
          p_key: string
          p_lane: string
          p_owner_id: string
          p_start?: boolean
          p_symbol: string
        }
        Returns: boolean
      }
      review_investment_thesis: {
        Args: {
          p_decision: string
          p_owner_id: string
          p_rationale: string
          p_thesis_id: string
        }
        Returns: {
          content: Json
          data_as_of: string
          entity_key: string
          entity_type: string
          generated_at: string
          id: string
          owner_id: string
          research_note_id: string | null
          reviewed_at: string | null
          sector: string | null
          source_refs: Json
          status: string
          sub_industry: string | null
          symbol: string | null
          trigger: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "investment_theses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revise_world_source_canonical_url: {
        Args: {
          p_canonical_url: string
          p_rationale: string
          p_reviewer_id: string
          p_source_id: string
        }
        Returns: {
          approved_at: string | null
          blocked_reason: string | null
          canonical_url: string
          created_at: string
          discovered_by: string
          discovery_run_id: string | null
          evidence_classes: Json
          id: string
          label: string
          metadata: Json
          publisher: string
          slug: string
          source_kind: string
          source_tier: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "world_source_registry"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      screener_history_metrics: {
        Args: { p_as_of: string; p_feed: string; p_symbols: string[] }
        Returns: {
          average_volume: number
          bar_count: number
          close_180d: number
          close_1y: number
          close_30d: number
          close_5d: number
          close_90d: number
          close_ytd: number
          fifty_day_average: number
          range_values: number[]
          symbol: string
          year_high: number
          year_low: number
        }[]
      }
      screener_history_metrics_v2: {
        Args: { p_as_of: string; p_feed: string; p_symbols: string[] }
        Returns: {
          average_volume: number
          bar_count: number
          close_180d: number
          close_1y: number
          close_30d: number
          close_5d: number
          close_90d: number
          close_ytd: number
          fifty_day_average: number
          history_through: string
          range_values: number[]
          symbol: string
          year_high: number
          year_low: number
        }[]
      }
      set_worker_claim_gate: {
        Args: {
          p_expected_release_sha?: string
          p_paused: boolean
          p_reason?: string
        }
        Returns: Json
      }
      worker_claim_gate_status: { Args: never; Returns: Json }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
