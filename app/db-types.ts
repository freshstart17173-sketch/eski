// db-types.ts — generated from the live schema via Supabase MCP generate_typescript_types.
// Source of truth is the DB + the schema-*.sql migrations; regenerate after any DDL
// change (BUILDLOG GOTCHA E). The app is vanilla JS today; app/supabase.js JSDoc-types
// the client against this file so `tsc --checkJs` catches wrong column/RPC names and
// shape drift statically (tsconfig.json). Regenerate: Supabase MCP generate_typescript_types
// (project zidqagrmxeawpasurpwi), paste the `types` field body below this header.

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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          meta: Json | null
          server_id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json | null
          server_id: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json | null
          server_id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_categories: {
        Row: {
          id: string
          name: string
          position: number
          server_id: string
        }
        Insert: {
          id?: string
          name: string
          position?: number
          server_id: string
        }
        Update: {
          id?: string
          name?: string
          position?: number
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_categories_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_prefs: {
        Row: {
          channel_id: string
          level: string
          muted_until: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          level?: string
          muted_until?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          level?: string
          muted_until?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_prefs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_reads: {
        Row: {
          channel_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_reads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_roles: {
        Row: {
          channel_id: string
          role_id: string
        }
        Insert: {
          channel_id: string
          role_id: string
        }
        Update: {
          channel_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_roles_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          allowed_kinds: string[] | null
          category_id: string | null
          created_at: string
          default_folder_id: string | null
          id: string
          kind: string
          name: string
          position: number
          post_policy: string
          server_id: string
          slowmode_sec: number
          topic: string | null
        }
        Insert: {
          allowed_kinds?: string[] | null
          category_id?: string | null
          created_at?: string
          default_folder_id?: string | null
          id?: string
          kind?: string
          name: string
          position?: number
          post_policy?: string
          server_id: string
          slowmode_sec?: number
          topic?: string | null
        }
        Update: {
          allowed_kinds?: string[] | null
          category_id?: string | null
          created_at?: string
          default_folder_id?: string | null
          id?: string
          kind?: string
          name?: string
          position?: number
          post_policy?: string
          server_id?: string
          slowmode_sec?: number
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "channel_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_default_folder_id_fkey"
            columns: ["default_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string | null
          context: string
          created_at: string
          deleted_at: string | null
          id: string
          parent_id: string | null
          resolved_at: string | null
          user_id: string
          work_id: string
        }
        Insert: {
          body?: string | null
          context?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          parent_id?: string | null
          resolved_at?: string | null
          user_id: string
          work_id: string
        }
        Update: {
          body?: string | null
          context?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          parent_id?: string | null
          resolved_at?: string | null
          user_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      content_tags: {
        Row: {
          id: string
          tag: string
          work_id: string
        }
        Insert: {
          id?: string
          tag: string
          work_id: string
        }
        Update: {
          id?: string
          tag?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_tags_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_channels: {
        Row: {
          created_at: string
          id: string
          is_group: boolean
          name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_group?: boolean
          name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_group?: boolean
          name?: string | null
        }
        Relationships: []
      }
      dm_members: {
        Row: {
          dm_channel_id: string
          hidden: boolean
          last_read_at: string | null
          muted: boolean
          pinned: boolean
          user_id: string
        }
        Insert: {
          dm_channel_id: string
          hidden?: boolean
          last_read_at?: string | null
          muted?: boolean
          pinned?: boolean
          user_id: string
        }
        Update: {
          dm_channel_id?: string
          hidden?: boolean
          last_read_at?: string | null
          muted?: boolean
          pinned?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_members_dm_channel_id_fkey"
            columns: ["dm_channel_id"]
            isOneToOne: false
            referencedRelation: "dm_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_message_reactions: {
        Row: {
          dm_message_id: string
          emoji: string
          user_id: string
        }
        Insert: {
          dm_message_id: string
          emoji: string
          user_id: string
        }
        Update: {
          dm_message_id?: string
          emoji?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_message_reactions_dm_message_id_fkey"
            columns: ["dm_message_id"]
            isOneToOne: false
            referencedRelation: "dm_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_messages: {
        Row: {
          body: string | null
          created_at: string
          deleted_at: string | null
          dm_channel_id: string
          edited_at: string | null
          id: string
          parent_id: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          dm_channel_id: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          dm_channel_id?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_messages_dm_channel_id_fkey"
            columns: ["dm_channel_id"]
            isOneToOne: false
            referencedRelation: "dm_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "dm_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_tags: {
        Row: {
          created_at: string
          folder_id: string | null
          id: string
          save_folder_id: string | null
          tag: string
        }
        Insert: {
          created_at?: string
          folder_id?: string | null
          id?: string
          save_folder_id?: string | null
          tag: string
        }
        Update: {
          created_at?: string
          folder_id?: string | null
          id?: string
          save_folder_id?: string | null
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_tags_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_tags_save_folder_id_fkey"
            columns: ["save_folder_id"]
            isOneToOne: false
            referencedRelation: "save_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          locked: boolean
          name: string
          parent_id: string | null
          server_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          locked?: boolean
          name: string
          parent_id?: string | null
          server_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          locked?: boolean
          name?: string
          parent_id?: string | null
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          a_user: string
          b_user: string
          created_at: string
          requested_by: string
          status: string
        }
        Insert: {
          a_user: string
          b_user: string
          created_at?: string
          requested_by: string
          status: string
        }
        Update: {
          a_user?: string
          b_user?: string
          created_at?: string
          requested_by?: string
          status?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_cents: number | null
          created_at: string
          currency: string | null
          hosted_url: string | null
          id: string
          owner_id: string
          owner_type: string
          status: string | null
          stripe_invoice_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          hosted_url?: string | null
          id?: string
          owner_id: string
          owner_type: string
          status?: string | null
          stripe_invoice_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          hosted_url?: string | null
          id?: string
          owner_id?: string
          owner_type?: string
          status?: string | null
          stripe_invoice_id?: string | null
        }
        Relationships: []
      }
      join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          message: string | null
          server_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          message?: string | null
          server_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          message?: string | null
          server_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      media_blobs: {
        Row: {
          bytes: number
          refcount: number
          sha256: string
        }
        Insert: {
          bytes: number
          refcount?: number
          sha256: string
        }
        Update: {
          bytes?: number
          refcount?: number
          sha256?: string
        }
        Relationships: []
      }
      member_roles: {
        Row: {
          role_id: string
          server_id: string
          user_id: string
        }
        Insert: {
          role_id: string
          server_id: string
          user_id: string
        }
        Update: {
          role_id?: string
          server_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_roles_server_id_user_id_fkey"
            columns: ["server_id", "user_id"]
            isOneToOne: false
            referencedRelation: "server_members"
            referencedColumns: ["server_id", "user_id"]
          },
        ]
      }
      mentions: {
        Row: {
          mentioned_user: string
          message_id: string
          server_id: string | null
        }
        Insert: {
          mentioned_user: string
          message_id: string
          server_id?: string | null
        }
        Update: {
          mentioned_user?: string
          message_id?: string
          server_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentions_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_pins: {
        Row: {
          channel_id: string
          created_at: string
          message_id: string
          pinned_by: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          message_id: string
          pinned_by?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          message_id?: string
          pinned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_pins_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          also_to_channel: boolean
          body: string | null
          body_tsv: unknown
          channel_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          forwarded_from: string | null
          id: string
          parent_id: string | null
          user_id: string
          work_id: string | null
        }
        Insert: {
          also_to_channel?: boolean
          body?: string | null
          body_tsv?: unknown
          channel_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          forwarded_from?: string | null
          id?: string
          parent_id?: string | null
          user_id: string
          work_id?: string | null
        }
        Update: {
          also_to_channel?: boolean
          body?: string | null
          body_tsv?: unknown
          channel_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          forwarded_from?: string | null
          id?: string
          parent_id?: string | null
          user_id?: string
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_forwarded_from_fkey"
            columns: ["forwarded_from"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          excerpt: string | null
          id: string
          kind: string
          read_at: string | null
          server_id: string | null
          target_id: string | null
          target_ref: string | null
          target_type: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          kind: string
          read_at?: string | null
          server_id?: string | null
          target_id?: string | null
          target_ref?: string | null
          target_type?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          server_id?: string | null
          target_id?: string | null
          target_ref?: string | null
          target_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      placement: {
        Row: {
          channel_id: string | null
          created_at: string
          folder_id: string | null
          id: string
          placed_by: string | null
          surface: string
          surface_id: string | null
          work_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          placed_by?: string | null
          surface: string
          surface_id?: string | null
          work_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          placed_by?: string | null
          surface?: string
          surface_id?: string | null
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "placement_channel_fk"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placement_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placement_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_key: string | null
          banner_key: string | null
          bio: string | null
          created_at: string
          handle: string | null
          id: string
          links: Json | null
          name: string | null
          presence_state: string
          pronouns: string | null
          status_emoji: string | null
          status_expires_at: string | null
          status_text: string | null
          tz: string | null
        }
        Insert: {
          avatar_key?: string | null
          banner_key?: string | null
          bio?: string | null
          created_at?: string
          handle?: string | null
          id: string
          links?: Json | null
          name?: string | null
          presence_state?: string
          pronouns?: string | null
          status_emoji?: string | null
          status_expires_at?: string | null
          status_text?: string | null
          tz?: string | null
        }
        Update: {
          avatar_key?: string | null
          banner_key?: string | null
          bio?: string | null
          created_at?: string
          handle?: string | null
          id?: string
          links?: Json | null
          name?: string | null
          presence_state?: string
          pronouns?: string | null
          status_emoji?: string | null
          status_expires_at?: string | null
          status_text?: string | null
          tz?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          reporter_id: string
          server_id: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          reporter_id: string
          server_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          reporter_id?: string
          server_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          color: number | null
          created_at: string
          hide_posts_by_default: boolean
          id: string
          is_default: boolean
          name: string
          permissions: number
          position: number
          server_id: string
        }
        Insert: {
          color?: number | null
          created_at?: string
          hide_posts_by_default?: boolean
          id?: string
          is_default?: boolean
          name: string
          permissions?: number
          position?: number
          server_id: string
        }
        Update: {
          color?: number | null
          created_at?: string
          hide_posts_by_default?: boolean
          id?: string
          is_default?: boolean
          name?: string
          permissions?: number
          position?: number
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      save_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "save_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "save_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_items: {
        Row: {
          created_at: string
          folder_id: string | null
          user_id: string
          work_id: string
        }
        Insert: {
          created_at?: string
          folder_id?: string | null
          user_id: string
          work_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string | null
          user_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "save_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_items_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      server_bans: {
        Row: {
          banned_by: string | null
          created_at: string
          id: string
          reason: string | null
          server_id: string
          until: string | null
          user_id: string
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          server_id: string
          until?: string | null
          user_id: string
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          server_id?: string
          until?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_bans_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      server_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          max_uses: number | null
          server_id: string
          uses: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          max_uses?: number | null
          server_id: string
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          max_uses?: number | null
          server_id?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "server_invites_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      server_members: {
        Row: {
          color: number | null
          joined_at: string
          posts_require_approval: boolean
          server_id: string
          status: string
          timeout_until: string | null
          user_id: string
        }
        Insert: {
          color?: number | null
          joined_at?: string
          posts_require_approval?: boolean
          server_id: string
          status?: string
          timeout_until?: string | null
          user_id: string
        }
        Update: {
          color?: number | null
          joined_at?: string
          posts_require_approval?: boolean
          server_id?: string
          status?: string
          timeout_until?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_members_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      server_prefs: {
        Row: {
          level: string
          muted_until: string | null
          server_id: string
          suppress_everyone: boolean
          user_id: string
        }
        Insert: {
          level?: string
          muted_until?: string | null
          server_id: string
          suppress_everyone?: boolean
          user_id: string
        }
        Update: {
          level?: string
          muted_until?: string | null
          server_id?: string
          suppress_everyone?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_prefs_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          cover_key: string | null
          created_at: string
          description: string | null
          hide_posts_by_default: boolean
          icon_key: string | null
          id: string
          name: string
          owner_id: string
          slug: string | null
        }
        Insert: {
          cover_key?: string | null
          created_at?: string
          description?: string | null
          hide_posts_by_default?: boolean
          icon_key?: string | null
          id?: string
          name: string
          owner_id: string
          slug?: string | null
        }
        Update: {
          cover_key?: string | null
          created_at?: string
          description?: string | null
          hide_posts_by_default?: boolean
          icon_key?: string | null
          id?: string
          name?: string
          owner_id?: string
          slug?: string | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          created_at: string
          current: boolean
          device: string | null
          id: string
          ip_hint: string | null
          last_seen_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          current?: boolean
          device?: string | null
          id?: string
          ip_hint?: string | null
          last_seen_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          current?: boolean
          device?: string | null
          id?: string
          ip_hint?: string | null
          last_seen_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      share_links: {
        Row: {
          access: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          folder_id: string | null
          folder_source: string | null
          revoked_at: string | null
          token: string
          work_id: string | null
        }
        Insert: {
          access?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          folder_id?: string | null
          folder_source?: string | null
          revoked_at?: string | null
          token: string
          work_id?: string | null
        }
        Update: {
          access?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          folder_id?: string | null
          folder_source?: string | null
          revoked_at?: string | null
          token?: string
          work_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_links_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      starred_items: {
        Row: {
          created_at: string
          user_id: string
          work_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          work_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "starred_items_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_balance: {
        Row: {
          owner_id: string
          owner_type: string
          purchased_gb: number
          status: string
          stripe_customer: string | null
        }
        Insert: {
          owner_id: string
          owner_type: string
          purchased_gb?: number
          status?: string
          stripe_customer?: string | null
        }
        Update: {
          owner_id?: string
          owner_type?: string
          purchased_gb?: number
          status?: string
          stripe_customer?: string | null
        }
        Relationships: []
      }
      storage_meters: {
        Row: {
          bytes_used: number
          owner_id: string
          owner_type: string
          updated_at: string
        }
        Insert: {
          bytes_used?: number
          owner_id: string
          owner_type: string
          updated_at?: string
        }
        Update: {
          bytes_used?: number
          owner_id?: string
          owner_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      upload_quota: {
        Row: {
          count: number
          day: string
          user_id: string
        }
        Insert: {
          count?: number
          day?: string
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          user_id?: string
        }
        Relationships: []
      }
      work_collaborators: {
        Row: {
          author_id: string | null
          role: string | null
          status: string
          user_id: string
          work_id: string
        }
        Insert: {
          author_id?: string | null
          role?: string | null
          status: string
          user_id: string
          work_id: string
        }
        Update: {
          author_id?: string | null
          role?: string | null
          status?: string
          user_id?: string
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_collaborators_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      work_items: {
        Row: {
          blob_sha: string | null
          id: string
          position: number
          work_id: string
        }
        Insert: {
          blob_sha?: string | null
          id?: string
          position?: number
          work_id: string
        }
        Update: {
          blob_sha?: string | null
          id?: string
          position?: number
          work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_items_blob_sha_fkey"
            columns: ["blob_sha"]
            isOneToOne: false
            referencedRelation: "media_blobs"
            referencedColumns: ["sha256"]
          },
          {
            foreignKeyName: "work_items_work_id_fkey"
            columns: ["work_id"]
            isOneToOne: false
            referencedRelation: "works"
            referencedColumns: ["id"]
          },
        ]
      }
      works: {
        Row: {
          approved_at: string | null
          author_id: string
          blob_sha: string | null
          bytes: number
          created_at: string
          deleted_at: string | null
          file_ext: string | null
          hidden: boolean
          id: string
          kind: string | null
          owner_id: string
          owner_type: string
          search_tsv: unknown
          server_id: string | null
          title: string | null
          visibility: string
        }
        Insert: {
          approved_at?: string | null
          author_id: string
          blob_sha?: string | null
          bytes?: number
          created_at?: string
          deleted_at?: string | null
          file_ext?: string | null
          hidden?: boolean
          id?: string
          kind?: string | null
          owner_id: string
          owner_type: string
          search_tsv?: unknown
          server_id?: string | null
          title?: string | null
          visibility?: string
        }
        Update: {
          approved_at?: string | null
          author_id?: string
          blob_sha?: string | null
          bytes?: number
          created_at?: string
          deleted_at?: string | null
          file_ext?: string | null
          hidden?: boolean
          id?: string
          kind?: string | null
          owner_id?: string
          owner_type?: string
          search_tsv?: unknown
          server_id?: string | null
          title?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "works_blob_sha_fkey"
            columns: ["blob_sha"]
            isOneToOne: false
            referencedRelation: "media_blobs"
            referencedColumns: ["sha256"]
          },
          {
            foreignKeyName: "works_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_collaborator: {
        Args: { handle: string; role?: string; work_id: string }
        Returns: {
          author_id: string | null
          role: string | null
          status: string
          user_id: string
          work_id: string
        }
        SetofOptions: {
          from: "*"
          to: "work_collaborators"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_folder_tag: {
        Args: { p_folder: string; p_save_folder: string; p_tag: string }
        Returns: {
          created_at: string
          folder_id: string | null
          id: string
          save_folder_id: string | null
          tag: string
        }
        SetofOptions: {
          from: "*"
          to: "folder_tags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_friend: {
        Args: { handle: string }
        Returns: {
          a_user: string
          b_user: string
          created_at: string
          requested_by: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "friendships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_tag: {
        Args: { tag: string; work_id: string }
        Returns: {
          id: string
          tag: string
          work_id: string
        }
        SetofOptions: {
          from: "*"
          to: "content_tags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_join_request: {
        Args: { p_server_id: string; p_user_id: string }
        Returns: undefined
      }
      ban_member: {
        Args: {
          reason?: string
          server_id: string
          target_user: string
          until?: string
        }
        Returns: undefined
      }
      block_user: { Args: { target_id: string }; Returns: undefined }
      can_interact_channel: { Args: { cid: string }; Returns: boolean }
      can_moderate_channel: { Args: { cid: string }; Returns: boolean }
      can_post_channel: { Args: { cid: string }; Returns: boolean }
      can_read_work: { Args: { wid: string }; Returns: boolean }
      can_view_channel: { Args: { cid: string }; Returns: boolean }
      can_view_message: { Args: { mid: string }; Returns: boolean }
      can_write_work: { Args: { wid: string }; Returns: boolean }
      channel_unread_counts: {
        Args: { p_server: string }
        Returns: {
          channel_id: string
          unread: number
        }[]
      }
      claim_upload_quota: { Args: { n: number }; Returns: Json }
      create_dm: {
        Args: { handle: string }
        Returns: {
          created_at: string
          id: string
          is_group: boolean
          name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "dm_channels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_folder: {
        Args: { name: string; parent_id: string; server_id: string }
        Returns: {
          archived: boolean
          created_at: string
          id: string
          locked: boolean
          name: string
          parent_id: string | null
          server_id: string
        }
        SetofOptions: {
          from: "*"
          to: "folders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_folder_share: {
        Args: { p_folder_id: string; p_source: string }
        Returns: string
      }
      create_group_dm: {
        Args: { handles: string[] }
        Returns: {
          created_at: string
          id: string
          is_group: boolean
          name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "dm_channels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_server: {
        Args: { p_channels?: string[]; p_name: string }
        Returns: {
          cover_key: string | null
          created_at: string
          description: string | null
          hide_posts_by_default: boolean
          icon_key: string | null
          id: string
          name: string
          owner_id: string
          slug: string | null
        }
        SetofOptions: {
          from: "*"
          to: "servers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_work: {
        Args: {
          p_blob_sha: string
          p_bytes: number
          p_channel_id?: string
          p_file_ext: string
          p_folder_id?: string
          p_kind: string
          p_owner_id: string
          p_owner_type: string
          p_server_id: string
          p_tags?: string[]
          p_title: string
          p_visibility: string
        }
        Returns: string
      }
      decline_join_request: {
        Args: { p_server_id: string; p_user_id: string }
        Returns: undefined
      }
      delete_server: { Args: { p_server_id: string }; Returns: undefined }
      dm_member: { Args: { dm: string }; Returns: boolean }
      everyone_perms: { Args: never; Returns: number }
      export_manifest: { Args: { scope: string }; Returns: Json }
      extract_handles: { Args: { txt: string }; Returns: string[] }
      folder_tag_readable: {
        Args: { p_folder: string; p_save: string }
        Returns: boolean
      }
      folder_tag_writable: {
        Args: { p_folder: string; p_save: string }
        Returns: boolean
      }
      has_perm: { Args: { flag: number; sid: string }; Returns: boolean }
      invite_user_to_server: {
        Args: { p_server: string; p_target: string }
        Returns: string
      }
      is_friend: { Args: { other: string }; Returns: boolean }
      is_server_admin: { Args: { sid: string }; Returns: boolean }
      join_via_invite: {
        Args: { code: string }
        Returns: {
          cover_key: string | null
          created_at: string
          description: string | null
          hide_posts_by_default: boolean
          icon_key: string | null
          id: string
          name: string
          owner_id: string
          slug: string | null
        }
        SetofOptions: {
          from: "*"
          to: "servers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kick_member: {
        Args: { server_id: string; target_user: string }
        Returns: undefined
      }
      mark_channel_read: { Args: { channel_id: string }; Returns: undefined }
      member_of: { Args: { sid: string }; Returns: boolean }
      meter_bump: {
        Args: { delta: number; oid: string; otype: string }
        Returns: undefined
      }
      move_to_folder: {
        Args: { folder_id: string; target: string }
        Returns: undefined
      }
      move_works_to_folder: {
        Args: { folder_id: string; work_ids: string[] }
        Returns: undefined
      }
      perm_bit: { Args: { flag: string }; Returns: number }
      pin_message: { Args: { message_id: string }; Returns: undefined }
      post_comment: {
        Args: { p_body: string; p_work_id: string }
        Returns: {
          created_at: string
          id: string
        }[]
      }
      preview_invite: {
        Args: { p_code: string }
        Returns: {
          icon_key: string
          inviter_name: string
          member_count: number
          server_id: string
          server_name: string
        }[]
      }
      purge_trashed_works: { Args: never; Returns: number }
      register_blob: {
        Args: { p_bytes: number; p_sha: string }
        Returns: undefined
      }
      remove_collaborator: { Args: { work_id: string }; Returns: undefined }
      remove_folder_tag: {
        Args: { p_folder: string; p_save_folder: string; p_tag: string }
        Returns: undefined
      }
      request_to_join_server: {
        Args: { p_message?: string; p_server_id: string }
        Returns: string
      }
      resolve_folder_share: {
        Args: { p_token: string }
        Returns: {
          blob_sha: string
          bytes: number
          file_ext: string
          file_id: string
          folder_name: string
          kind: string
          server_id: string
          server_name: string
          source: string
          title: string
        }[]
      }
      resolve_share_link: {
        Args: { token: string }
        Returns: {
          approved_at: string | null
          author_id: string
          blob_sha: string | null
          bytes: number
          created_at: string
          deleted_at: string | null
          file_ext: string | null
          hidden: boolean
          id: string
          kind: string | null
          owner_id: string
          owner_type: string
          search_tsv: unknown
          server_id: string | null
          title: string | null
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "works"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_friend: {
        Args: { accept: boolean; target_id: string }
        Returns: undefined
      }
      search_all: {
        Args: { q: string; scope?: string }
        Returns: {
          created_at: string
          id: string
          rank: number
          snippet: string
          source: string
          title: string
        }[]
      }
      search_files: {
        Args: {
          p_dir?: string
          p_exts?: string[]
          p_hastypes?: string[]
          p_limit?: number
          p_offset?: number
          p_server?: string
          p_since?: string
          p_sort?: string
          p_sort_tag?: string
          p_source?: string
          p_tags?: string[]
          p_text?: string
          p_uploader?: string
        }
        Returns: {
          author_handle: string
          author_id: string
          author_name: string
          blob_sha: string
          bytes: number
          channel_name: string
          created_at: string
          file_ext: string
          folder_id: string
          hidden: boolean
          id: string
          kind: string
          tags: string[]
          title: string
          total: number
        }[]
      }
      set_channel_access: {
        Args: { channel_id: string; role_ids: string[] }
        Returns: undefined
      }
      set_member_roles: {
        Args: { role_ids: string[]; server_id: string; target_user: string }
        Returns: undefined
      }
      timeout_member: {
        Args: { server_id: string; target_user: string; until: string }
        Returns: undefined
      }
      toggle_reaction: {
        Args: { emoji: string; message_id: string }
        Returns: boolean
      }
      unpin_message: { Args: { message_id: string }; Returns: undefined }
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
