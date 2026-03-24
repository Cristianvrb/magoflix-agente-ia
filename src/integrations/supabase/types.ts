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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_creatives: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          id: string
          image_url: string | null
          raw_data: Json | null
          source: string | null
          track_id: string | null
          track_source: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          raw_data?: Json | null
          source?: string | null
          track_id?: string | null
          track_source?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          raw_data?: Json | null
          source?: string | null
          track_id?: string | null
          track_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_creatives_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_knowledge: {
        Row: {
          agent_id: string
          id: string
          knowledge_entry_id: string
        }
        Insert: {
          agent_id: string
          id?: string
          knowledge_entry_id: string
        }
        Update: {
          agent_id?: string
          id?: string
          knowledge_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_knowledge_knowledge_entry_id_fkey"
            columns: ["knowledge_entry_id"]
            isOneToOne: false
            referencedRelation: "knowledge_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_settings: {
        Row: {
          agent_name: string
          agent_prompt: string
          business_hours_enabled: boolean
          business_hours_end: string
          business_hours_start: string
          business_hours_timezone: string
          card_payment_url: string
          card_payment_url_fallback: string
          created_at: string
          faq: string
          followup_delay_hours: number
          followup_enabled: boolean
          followup_message: string
          id: string
          openai_api_key: string | null
          outside_hours_message: string
          payment_error_card_message: string
          payment_error_pix_message: string
          pix_evp_key: string
          pix_evp_key_fallback: string
          product_info: string
          response_delay_max: number
          response_delay_min: number
          simulate_typing: boolean
          uazapi_subdomain: string
          uazapi_token: string
          updated_at: string
          welcome_audio_url: string
          welcome_audio_url_es: string
          welcome_message: string
        }
        Insert: {
          agent_name?: string
          agent_prompt?: string
          business_hours_enabled?: boolean
          business_hours_end?: string
          business_hours_start?: string
          business_hours_timezone?: string
          card_payment_url?: string
          card_payment_url_fallback?: string
          created_at?: string
          faq?: string
          followup_delay_hours?: number
          followup_enabled?: boolean
          followup_message?: string
          id?: string
          openai_api_key?: string | null
          outside_hours_message?: string
          payment_error_card_message?: string
          payment_error_pix_message?: string
          pix_evp_key?: string
          pix_evp_key_fallback?: string
          product_info?: string
          response_delay_max?: number
          response_delay_min?: number
          simulate_typing?: boolean
          uazapi_subdomain?: string
          uazapi_token?: string
          updated_at?: string
          welcome_audio_url?: string
          welcome_audio_url_es?: string
          welcome_message?: string
        }
        Update: {
          agent_name?: string
          agent_prompt?: string
          business_hours_enabled?: boolean
          business_hours_end?: string
          business_hours_start?: string
          business_hours_timezone?: string
          card_payment_url?: string
          card_payment_url_fallback?: string
          created_at?: string
          faq?: string
          followup_delay_hours?: number
          followup_enabled?: boolean
          followup_message?: string
          id?: string
          openai_api_key?: string | null
          outside_hours_message?: string
          payment_error_card_message?: string
          payment_error_pix_message?: string
          pix_evp_key?: string
          pix_evp_key_fallback?: string
          product_info?: string
          response_delay_max?: number
          response_delay_min?: number
          simulate_typing?: boolean
          uazapi_subdomain?: string
          uazapi_token?: string
          updated_at?: string
          welcome_audio_url?: string
          welcome_audio_url_es?: string
          welcome_message?: string
        }
        Relationships: []
      }
      agents: {
        Row: {
          ai_model: string | null
          away_message: string | null
          block_external_search: boolean | null
          business_hours_end: string | null
          business_hours_start: string | null
          context_limit: number | null
          created_at: string | null
          description: string | null
          display_name: string | null
          end_with_question: boolean | null
          faq: string | null
          followup_delay_minutes: number | null
          followup_enabled: boolean | null
          humanized_mode: boolean | null
          icon: string | null
          id: string
          inactivity_timeout_minutes: number | null
          is_active: boolean | null
          language: string | null
          max_chars_per_message: number | null
          max_tokens: number | null
          message_buffer_seconds: number | null
          name: string
          product_info: string | null
          prompt: string | null
          rate_limit_per_minute: number | null
          response_delay_seconds: number | null
          restrict_topic: boolean | null
          temperature: number | null
          user_id: string
          welcome_message: string | null
        }
        Insert: {
          ai_model?: string | null
          away_message?: string | null
          block_external_search?: boolean | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          context_limit?: number | null
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          end_with_question?: boolean | null
          faq?: string | null
          followup_delay_minutes?: number | null
          followup_enabled?: boolean | null
          humanized_mode?: boolean | null
          icon?: string | null
          id?: string
          inactivity_timeout_minutes?: number | null
          is_active?: boolean | null
          language?: string | null
          max_chars_per_message?: number | null
          max_tokens?: number | null
          message_buffer_seconds?: number | null
          name: string
          product_info?: string | null
          prompt?: string | null
          rate_limit_per_minute?: number | null
          response_delay_seconds?: number | null
          restrict_topic?: boolean | null
          temperature?: number | null
          user_id: string
          welcome_message?: string | null
        }
        Update: {
          ai_model?: string | null
          away_message?: string | null
          block_external_search?: boolean | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          context_limit?: number | null
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          end_with_question?: boolean | null
          faq?: string | null
          followup_delay_minutes?: number | null
          followup_enabled?: boolean | null
          humanized_mode?: boolean | null
          icon?: string | null
          id?: string
          inactivity_timeout_minutes?: number | null
          is_active?: boolean | null
          language?: string | null
          max_chars_per_message?: number | null
          max_tokens?: number | null
          message_buffer_seconds?: number | null
          name?: string
          product_info?: string | null
          prompt?: string | null
          rate_limit_per_minute?: number | null
          response_delay_seconds?: number | null
          restrict_topic?: boolean | null
          temperature?: number | null
          user_id?: string
          welcome_message?: string | null
        }
        Relationships: []
      }
      campaign_snapshots: {
        Row: {
          campaign_id: string
          campaign_name: string
          clicks: number
          cpc: number
          cpm: number
          created_at: string
          ctr: number
          date: string
          id: string
          impressions: number
          leads_meta: number
          reach: number
          spend: number
        }
        Insert: {
          campaign_id: string
          campaign_name?: string
          clicks?: number
          cpc?: number
          cpm?: number
          created_at?: string
          ctr?: number
          date?: string
          id?: string
          impressions?: number
          leads_meta?: number
          reach?: number
          spend?: number
        }
        Update: {
          campaign_id?: string
          campaign_name?: string
          clicks?: number
          cpc?: number
          cpm?: number
          created_at?: string
          ctr?: number
          date?: string
          id?: string
          impressions?: number
          leads_meta?: number
          reach?: number
          spend?: number
        }
        Relationships: []
      }
      changelog: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string
          id: string
          title: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      chatbot_flows: {
        Row: {
          ab_weight: number
          agent_id: string
          created_at: string
          edges: Json
          id: string
          is_active: boolean
          name: string
          nodes: Json
          stats_converted: number
          stats_qualified: number
          stats_sent: number
          updated_at: string
        }
        Insert: {
          ab_weight?: number
          agent_id: string
          created_at?: string
          edges?: Json
          id?: string
          is_active?: boolean
          name?: string
          nodes?: Json
          stats_converted?: number
          stats_qualified?: number
          stats_sent?: number
          updated_at?: string
        }
        Update: {
          ab_weight?: number
          agent_id?: string
          created_at?: string
          edges?: Json
          id?: string
          is_active?: boolean
          name?: string
          nodes?: Json
          stats_converted?: number
          stats_qualified?: number
          stats_sent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_flows_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_memories: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          memory_type: string
          updated_at: string
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          memory_type?: string
          updated_at?: string
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          memory_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_memories_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_summaries: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          message_count: number
          summary: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_count?: number
          summary: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_count?: number
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_summaries_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_enabled: boolean
          channel: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          flow_state: Json | null
          id: string
          instance_id: string | null
          lead_stage: string
          status: string
          updated_at: string
        }
        Insert: {
          ai_enabled?: boolean
          channel?: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          flow_state?: Json | null
          id?: string
          instance_id?: string | null
          lead_stage?: string
          status?: string
          updated_at?: string
        }
        Update: {
          ai_enabled?: boolean
          channel?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          flow_state?: Json | null
          id?: string
          instance_id?: string | null
          lead_stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      conversions: {
        Row: {
          conversation_id: string | null
          created_at: string
          currency: string
          event_name: string
          id: string
          meta_event_id: string | null
          sent_to_meta: boolean
          value: number
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          currency?: string
          event_name?: string
          id?: string
          meta_event_id?: string | null
          sent_to_meta?: boolean
          value?: number
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          currency?: string
          event_name?: string
          id?: string
          meta_event_id?: string | null
          sent_to_meta?: boolean
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_feedbacks: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url: string
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string
          user_id?: string
        }
        Relationships: []
      }
      group_events: {
        Row: {
          created_at: string
          event_type: string
          group_id: string | null
          id: string
          phone: string
        }
        Insert: {
          created_at?: string
          event_type?: string
          group_id?: string | null
          id?: string
          phone?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          group_id?: string | null
          id?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          audio_url: string | null
          content: string
          created_at: string
          group_id: string
          id: string
          image_url: string | null
          last_sent_at: string | null
          next_send_at: string | null
          schedule_enabled: boolean
          schedule_interval_hours: number
        }
        Insert: {
          audio_url?: string | null
          content?: string
          created_at?: string
          group_id: string
          id?: string
          image_url?: string | null
          last_sent_at?: string | null
          next_send_at?: string | null
          schedule_enabled?: boolean
          schedule_interval_hours?: number
        }
        Update: {
          audio_url?: string | null
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          image_url?: string | null
          last_sent_at?: string | null
          next_send_at?: string | null
          schedule_enabled?: boolean
          schedule_interval_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_templates: {
        Row: {
          audio_url: string | null
          content: string
          created_at: string
          id: string
          image_url: string | null
          name: string
        }
        Insert: {
          audio_url?: string | null
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
        }
        Update: {
          audio_url?: string | null
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          agent_id: string | null
          created_at: string
          enabled: boolean
          id: string
          instance_id: string | null
          members_joined: number
          members_left: number
          name: string
          respond_mode: string
          wa_group_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          instance_id?: string | null
          members_joined?: number
          members_left?: number
          name?: string
          respond_mode?: string
          wa_group_id: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          instance_id?: string | null
          members_joined?: number
          members_left?: number
          name?: string
          respond_mode?: string
          wa_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          agent_id: string | null
          created_at: string
          enabled: boolean
          id: string
          name: string
          uazapi_subdomain: string
          uazapi_token: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          uazapi_subdomain?: string
          uazapi_token?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          uazapi_subdomain?: string
          uazapi_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instances_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          agent_id: string
          created_at: string | null
          extracted_text: string | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          status: string | null
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          extracted_text?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          status?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          extracted_text?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_entries: {
        Row: {
          answer: string
          category: string | null
          created_at: string | null
          id: string
          question: string
          user_id: string
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string | null
          id?: string
          question: string
          user_id: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string | null
          id?: string
          question?: string
          user_id?: string
        }
        Relationships: []
      }
      manager_decisions: {
        Row: {
          action_payload: Json
          created_at: string
          data: Json
          decision_type: string
          description: string
          id: string
          priority: string
          reasoning: string
          rejected_reason: string
          result: string
          status: string
        }
        Insert: {
          action_payload?: Json
          created_at?: string
          data?: Json
          decision_type?: string
          description?: string
          id?: string
          priority?: string
          reasoning?: string
          rejected_reason?: string
          result?: string
          status?: string
        }
        Update: {
          action_payload?: Json
          created_at?: string
          data?: Json
          decision_type?: string
          description?: string
          id?: string
          priority?: string
          reasoning?: string
          rejected_reason?: string
          result?: string
          status?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          external_id: string | null
          id: string
          media_type: string | null
          media_url: string | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      pepper_products: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          offer_hash: string
          price_cents: number
          product_hash: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          offer_hash: string
          price_cents: number
          product_hash: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          offer_hash?: string
          price_cents?: number
          product_hash?: string
        }
        Relationships: []
      }
      pepper_transactions: {
        Row: {
          amount: number
          amount_liquid: number
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          hash: string
          id: string
          offer_hash: string
          offer_name: string
          payment_method: string
          payment_status: string
          pepper_created_at: string | null
          product_hash: string
          product_name: string
          synced_at: string
          utm_campaign: string
          utm_source: string
        }
        Insert: {
          amount?: number
          amount_liquid?: number
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          hash?: string
          id?: string
          offer_hash?: string
          offer_name?: string
          payment_method?: string
          payment_status?: string
          pepper_created_at?: string | null
          product_hash?: string
          product_name?: string
          synced_at?: string
          utm_campaign?: string
          utm_source?: string
        }
        Update: {
          amount?: number
          amount_liquid?: number
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          hash?: string
          id?: string
          offer_hash?: string
          offer_name?: string
          payment_method?: string
          payment_status?: string
          pepper_created_at?: string | null
          product_hash?: string
          product_name?: string
          synced_at?: string
          utm_campaign?: string
          utm_source?: string
        }
        Relationships: []
      }
      social_comments: {
        Row: {
          ai_auto_replied: boolean
          author_id: string | null
          author_name: string
          content: string
          created_at: string
          id: string
          platform: string
          post_id: string | null
          replied_at: string | null
          reply_content: string | null
        }
        Insert: {
          ai_auto_replied?: boolean
          author_id?: string | null
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          platform?: string
          post_id?: string | null
          replied_at?: string | null
          reply_content?: string | null
        }
        Update: {
          ai_auto_replied?: boolean
          author_id?: string | null
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          platform?: string
          post_id?: string | null
          replied_at?: string | null
          reply_content?: string | null
        }
        Relationships: []
      }
      social_dms: {
        Row: {
          ai_auto_replied: boolean
          content: string
          created_at: string
          id: string
          platform: string
          replied_at: string | null
          reply_content: string | null
          sender_id: string | null
          sender_name: string
        }
        Insert: {
          ai_auto_replied?: boolean
          content?: string
          created_at?: string
          id?: string
          platform?: string
          replied_at?: string | null
          reply_content?: string | null
          sender_id?: string | null
          sender_name?: string
        }
        Update: {
          ai_auto_replied?: boolean
          content?: string
          created_at?: string
          id?: string
          platform?: string
          replied_at?: string | null
          reply_content?: string | null
          sender_id?: string | null
          sender_name?: string
        }
        Relationships: []
      }
      social_keyword_replies: {
        Row: {
          active: boolean
          created_at: string
          id: string
          keyword: string
          reply_text: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          keyword: string
          reply_text?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          keyword?: string
          reply_text?: string
        }
        Relationships: []
      }
      social_metrics: {
        Row: {
          comments_count: number
          created_at: string
          date: string
          dms_count: number
          followers: number
          id: string
          impressions: number
          platform: string
          posts_count: number
          profile_views: number
          reach: number
        }
        Insert: {
          comments_count?: number
          created_at?: string
          date?: string
          dms_count?: number
          followers?: number
          id?: string
          impressions?: number
          platform?: string
          posts_count?: number
          profile_views?: number
          reach?: number
        }
        Update: {
          comments_count?: number
          created_at?: string
          date?: string
          dms_count?: number
          followers?: number
          id?: string
          impressions?: number
          platform?: string
          posts_count?: number
          profile_views?: number
          reach?: number
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          ai_generated: boolean
          content: string
          created_at: string
          error: string | null
          hashtags: string | null
          id: string
          ig_post_id: string | null
          image_url: string | null
          platform: string
          prompt: string | null
          published_at: string | null
          scheduled_at: string | null
          status: string
          threads_post_id: string | null
        }
        Insert: {
          ai_generated?: boolean
          content?: string
          created_at?: string
          error?: string | null
          hashtags?: string | null
          id?: string
          ig_post_id?: string | null
          image_url?: string | null
          platform?: string
          prompt?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          threads_post_id?: string | null
        }
        Update: {
          ai_generated?: boolean
          content?: string
          created_at?: string
          error?: string | null
          hashtags?: string | null
          id?: string
          ig_post_id?: string | null
          image_url?: string | null
          platform?: string
          prompt?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          threads_post_id?: string | null
        }
        Relationships: []
      }
      social_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      threads_prospects: {
        Row: {
          author_id: string | null
          author_username: string
          content: string
          created_at: string
          id: string
          keyword_matched: string
          replied_at: string | null
          reply_content: string | null
          status: string
          thread_id: string
        }
        Insert: {
          author_id?: string | null
          author_username?: string
          content?: string
          created_at?: string
          id?: string
          keyword_matched?: string
          replied_at?: string | null
          reply_content?: string | null
          status?: string
          thread_id: string
        }
        Update: {
          author_id?: string | null
          author_username?: string
          content?: string
          created_at?: string
          id?: string
          keyword_matched?: string
          replied_at?: string | null
          reply_content?: string | null
          status?: string
          thread_id?: string
        }
        Relationships: []
      }
      threads_trending_monitor: {
        Row: {
          author_username: string
          auto_replied: boolean
          content: string
          created_at: string
          id: string
          is_trending: boolean
          keyword_matched: string
          like_count: number
          post_timestamp: string | null
          reply_content: string | null
          reply_count: number
          repost_count: number
          snapshot_time: string
          thread_id: string
          velocity: number
          viral_score: number
        }
        Insert: {
          author_username?: string
          auto_replied?: boolean
          content?: string
          created_at?: string
          id?: string
          is_trending?: boolean
          keyword_matched?: string
          like_count?: number
          post_timestamp?: string | null
          reply_content?: string | null
          reply_count?: number
          repost_count?: number
          snapshot_time?: string
          thread_id: string
          velocity?: number
          viral_score?: number
        }
        Update: {
          author_username?: string
          auto_replied?: boolean
          content?: string
          created_at?: string
          id?: string
          is_trending?: boolean
          keyword_matched?: string
          like_count?: number
          post_timestamp?: string | null
          reply_content?: string | null
          reply_count?: number
          repost_count?: number
          snapshot_time?: string
          thread_id?: string
          velocity?: number
          viral_score?: number
        }
        Relationships: []
      }
      token_usage: {
        Row: {
          completion_tokens: number
          conversation_id: string | null
          cost_usd: number
          created_at: string
          id: string
          model: string
          prompt_tokens: number
          total_tokens: number
          usage_type: string
        }
        Insert: {
          completion_tokens?: number
          conversation_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          model?: string
          prompt_tokens?: number
          total_tokens?: number
          usage_type?: string
        }
        Update: {
          completion_tokens?: number
          conversation_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          model?: string
          prompt_tokens?: number
          total_tokens?: number
          usage_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_usage_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          instance_id: string | null
          payload: Json
          phone: string
          processed: boolean
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          instance_id?: string | null
          payload?: Json
          phone?: string
          processed?: boolean
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          instance_id?: string | null
          payload?: Json
          phone?: string
          processed?: boolean
        }
        Relationships: []
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
