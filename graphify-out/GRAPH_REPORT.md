# Graph Report - /home/puneeth/Desktop/medha  (2026-04-18)

## Corpus Check
- 47 files · ~136,346 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 134 nodes · 170 edges · 27 communities detected
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Tech Stack & Architecture|Tech Stack & Architecture]]
- [[_COMMUNITY_Interaction Patterns|Interaction Patterns]]
- [[_COMMUNITY_Data Layer|Data Layer]]
- [[_COMMUNITY_Core Chat UI|Core Chat UI]]
- [[_COMMUNITY_Settings & Pickers|Settings & Pickers]]
- [[_COMMUNITY_Onboarding & Errors|Onboarding & Errors]]
- [[_COMMUNITY_Chat Display|Chat Display]]
- [[_COMMUNITY_Authentication|Authentication]]
- [[_COMMUNITY_Design Foundation|Design Foundation]]
- [[_COMMUNITY_Design Tokens Spec|Design Tokens Spec]]
- [[_COMMUNITY_Component Specs|Component Specs]]
- [[_COMMUNITY_Messaging Screens|Messaging Screens]]
- [[_COMMUNITY_No-Shadow Elevation|No-Shadow Elevation]]
- [[_COMMUNITY_Surface Hierarchy|Surface Hierarchy]]
- [[_COMMUNITY_Inter Font|Inter Font]]
- [[_COMMUNITY_Search UI|Search UI]]
- [[_COMMUNITY_Dark Theme Philosophy|Dark Theme Philosophy]]
- [[_COMMUNITY_UI Blocks|UI Blocks]]
- [[_COMMUNITY_Empty States|Empty States]]
- [[_COMMUNITY_Theme System|Theme System]]
- [[_COMMUNITY_Components Spec|Components Spec]]
- [[_COMMUNITY_Editorial Authority|Editorial Authority]]
- [[_COMMUNITY_Structural Precision|Structural Precision]]
- [[_COMMUNITY_Nova Guidelines|Nova Guidelines]]
- [[_COMMUNITY_Carbon Typography|Carbon Typography]]
- [[_COMMUNITY_Carbon Guidelines|Carbon Guidelines]]
- [[_COMMUNITY_Brand|Brand]]

## God Nodes (most connected - your core abstractions)
1. `Medha AI Chat App Plan` - 16 edges
2. `Stitch Prompt Pattern` - 16 edges
3. `Chat Active Conversation` - 8 edges
4. `Model Picker` - 8 edges
5. `Sprint 4 - Chat UI Core` - 7 edges
6. `Chat Empty State` - 6 edges
7. `Sprint 1 - Database Foundation` - 6 edges
8. `Onboarding Screen` - 5 edges
9. `Settings Screen` - 5 edges
10. `API Key Management` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Settings Screen` --semantically_similar_to--> `Settings Screen Screen`  [INFERRED] [semantically similar]
  designs/06-settings.md → generated designs/settings_screen/screen.png
- `Chat Active Conversation Screen` --references--> `Markdown Rendering`  [INFERRED]
  generated designs/chat_active_conversation/screen.png → designs/11-markdown-rendering.md
- `Model Picker Bottom Sheet Screen` --variant_of--> `Model Picker`  [EXTRACTED]
  generated designs/model_picker_bottom_sheet_2/screen.png → designs/05-model-picker.md
- `Model Picker Bottom Sheet Screen` --variant_of--> `Model Picker`  [EXTRACTED]
  generated designs/model_picker_bottom_sheet_3/screen.png → designs/05-model-picker.md
- `Message Actions` --semantically_similar_to--> `Edit and Resend`  [INFERRED] [semantically similar]
  designs/10-message-actions.md → plan.md

## Hyperedges (group relationships)
- **Foundation Sprint Sequence** — sprint_0, sprint_1, sprint_2 [EXTRACTED 0.95]
- **Nova Design System Components** — design_nova, color_system, typography_scale, spacing_system, component_patterns, navigation_paradigm [EXTRACTED 0.95]
- **Chat UI Component Suite** — chat_empty_state, chat_active, message_bubble, input_bar, model_selector_pill, conversation_drawer, message_actions [EXTRACTED 0.90]
- **Monochromatic Dark-First Design System** — medha_design_specification_dark_mode_colors, medha_nova_tonal_architecture, medha_carbon_colors_tonal_depth [EXTRACTED 1.00]
- **No-Shadow Elevation Approach** — medha_nova_layering_principle, medha_carbon_tonal_elevation, medha_carbon_ambient_glow [INFERRED 0.80]
- **Inter Font Usage** — medha_design_specification_inter_font, medha_nova_inter, medha_carbon_inter [EXTRACTED 1.00]
- **Error State Variants** — error_state_screen, error_state_rate_limited_screen, onboarding_error_state_screen, offline_state_screen [EXTRACTED 1.00]
- **Chat-Related Screens** — chat_active_conversation_screen, chat_empty_state_screen, chat_screen_empty_state_screen, conversation_drawer_screen [EXTRACTED 1.00]
- **Model Picker Flow** — model_picker_bottom_sheet_1_screen, model_picker_bottom_sheet_2_screen, model_picker_bottom_sheet_3_screen [EXTRACTED 1.00]

## Communities

### Community 0 - "Tech Stack & Architecture"
Cohesion: 0.19
Nodes (17): AIProvider Interface, Build Instructions, Expo SDK 55, NativeWind v5, OpenRouter Provider, Medha AI Chat App Plan, Provider Abstraction, React Native 0.83 (+9 more)

### Community 1 - "Interaction Patterns"
Cohesion: 0.22
Nodes (13): Delete Confirmation Dialog, Dialog Pattern, Edit and Resend, Error Bubble Pattern, Error Offline States, Message Actions, Offline Banner Pattern, Sprint 7 - Edit Resend Themes (+5 more)

### Community 2 - "Data Layer"
Cohesion: 0.24
Nodes (12): Conversation CRUD, Conversation Drawer, conversations Table, Database Schema, expo-sqlite, Message CRUD, messages Table, MMKV (+4 more)

### Community 3 - "Core Chat UI"
Cohesion: 0.33
Nodes (11): Chat Active Conversation, Chat Empty State, Chat-First Pattern, Component Patterns, Drawer Navigation, Input Bar Component, Master Design Language, Message Bubble Component (+3 more)

### Community 4 - "Settings & Pickers"
Cohesion: 0.22
Nodes (11): Bottom Sheet Pattern, Bottom Sheet Component, Model Picker, Model Picker Bottom Sheet Screen, Model Picker Bottom Sheet Screen, Model Picker Bottom Sheet Screen, Settings Management, Settings Screen (+3 more)

### Community 5 - "Onboarding & Errors"
Cohesion: 0.18
Nodes (11): API Key Management Screen, Error Handling Pattern, Rate Limited Error State Screen, Error State Screen, Offline Indicator, Offline State Banner Screen, Offline State Screen, Onboarding API Key Setup Screen (+3 more)

### Community 6 - "Chat Display"
Cohesion: 0.22
Nodes (9): Chat Active Conversation Screen, Chat Interface Component, Conversation Drawer Screen, Conversation List Component, Markdown Rendering, Markdown Rendering Showcase Screen, Markdown Showcase, Sprint 5 - Markdown Rendering (+1 more)

### Community 7 - "Authentication"
Cohesion: 0.53
Nodes (6): API Key Management, API Key Validation, expo-local-authentication, expo-secure-store, Onboarding Screen, Sprint 3 - Onboarding Redo

### Community 8 - "Design Foundation"
Cohesion: 0.4
Nodes (5): Color System, Nova Design Style, Design Tokens, Spacing System, Typography Scale

### Community 9 - "Design Tokens Spec"
Cohesion: 0.83
Nodes (4): Colors and Tonal Depth, Core Design Tokens, Dark Mode Colors, Tonal Architecture

### Community 10 - "Component Specs"
Cohesion: 0.5
Nodes (4): Components, Glassmorphism, Navigation Paradigm, Precision Tools

### Community 11 - "Messaging Screens"
Cohesion: 0.5
Nodes (4): Delete Confirmation Dialog Screen, Message Actions Menu Screen, Message Edit Mode Screen, Messaging Features

### Community 12 - "No-Shadow Elevation"
Cohesion: 0.67
Nodes (3): Ambient Glow, Tonal Elevation, Layering Principle

### Community 13 - "Surface Hierarchy"
Cohesion: 0.67
Nodes (3): Surface Hierarchy, surface_container_highest, surface_container_low

### Community 14 - "Inter Font"
Cohesion: 1.0
Nodes (3): Inter Font, Inter Font, Inter Font

### Community 15 - "Search UI"
Cohesion: 0.67
Nodes (3): Search Functionality, Search Results Screen, Search Results Screen

### Community 16 - "Dark Theme Philosophy"
Cohesion: 1.0
Nodes (2): Obsidian Monolith, Quiet Intelligence

### Community 17 - "UI Blocks"
Cohesion: 1.0
Nodes (2): Message Bubbles (Pills), Editorial Blocks

### Community 18 - "Empty States"
Cohesion: 1.0
Nodes (2): Chat Empty State Screen, Chat Screen Empty State Screen

### Community 19 - "Theme System"
Cohesion: 1.0
Nodes (2): Theme Picker Screen, Theme System

### Community 20 - "Components Spec"
Cohesion: 1.0
Nodes (1): Components

### Community 21 - "Editorial Authority"
Cohesion: 1.0
Nodes (1): Editorial Authority

### Community 22 - "Structural Precision"
Cohesion: 1.0
Nodes (1): Structural Precision

### Community 23 - "Nova Guidelines"
Cohesion: 1.0
Nodes (1): Do's and Don'ts

### Community 24 - "Carbon Typography"
Cohesion: 1.0
Nodes (1): Typography

### Community 25 - "Carbon Guidelines"
Cohesion: 1.0
Nodes (1): Do's and Don'ts

### Community 26 - "Brand"
Cohesion: 1.0
Nodes (1): Medha AI Brand

## Knowledge Gaps
- **49 isolated node(s):** `Build Instructions`, `Master Design Language`, `Nova Design Style`, `Color System`, `Typography Scale` (+44 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Dark Theme Philosophy`** (2 nodes): `Obsidian Monolith`, `Quiet Intelligence`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Blocks`** (2 nodes): `Message Bubbles (Pills)`, `Editorial Blocks`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Empty States`** (2 nodes): `Chat Empty State Screen`, `Chat Screen Empty State Screen`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Theme System`** (2 nodes): `Theme Picker Screen`, `Theme System`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Components Spec`** (1 nodes): `Components`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Editorial Authority`** (1 nodes): `Editorial Authority`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Structural Precision`** (1 nodes): `Structural Precision`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Nova Guidelines`** (1 nodes): `Do's and Don'ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Carbon Typography`** (1 nodes): `Typography`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Carbon Guidelines`** (1 nodes): `Do's and Don'ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Brand`** (1 nodes): `Medha AI Brand`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Stitch Prompt Pattern` connect `Interaction Patterns` to `Data Layer`, `Core Chat UI`, `Settings & Pickers`, `Chat Display`, `Authentication`?**
  _High betweenness centrality (0.193) - this node is a cross-community bridge._
- **Why does `Medha AI Chat App Plan` connect `Tech Stack & Architecture` to `Data Layer`, `Authentication`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `Chat Active Conversation` connect `Core Chat UI` to `Tech Stack & Architecture`, `Interaction Patterns`, `Data Layer`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `Chat Active Conversation` (e.g. with `Message CRUD` and `SSE Streaming`) actually correct?**
  _`Chat Active Conversation` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Build Instructions`, `Master Design Language`, `Nova Design Style` to the rest of the system?**
  _49 weakly-connected nodes found - possible documentation gaps or missing edges._