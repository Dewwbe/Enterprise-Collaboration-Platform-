# ER Diagram

Generated from [`prisma/schema.prisma`](../prisma/schema.prisma). Renders natively on GitHub and in any Mermaid-aware Markdown viewer.

```mermaid
erDiagram
    USER ||--o{ REFRESH_TOKEN : has
    USER ||--o{ PASSWORD_RESET_TOKEN : has
    USER ||--o{ ORGANIZATION_MEMBER : "is member via"
    USER ||--o{ WORKSPACE_MEMBER : "is member via"
    USER ||--o{ TASK : "assigned as assignee"
    USER ||--o{ TASK : "assigned as reporter"
    USER ||--o{ COMMENT : authors
    USER ||--o{ ATTACHMENT : uploads
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ AUDIT_LOG : "acted as"

    ORGANIZATION ||--o{ ORGANIZATION_MEMBER : has
    ORGANIZATION ||--o{ WORKSPACE : has

    WORKSPACE ||--o{ WORKSPACE_MEMBER : has
    WORKSPACE ||--o{ PROJECT : has

    PROJECT ||--o{ TASK : has

    TASK ||--o{ COMMENT : has
    TASK ||--o{ ATTACHMENT : has

    USER {
        string id PK
        string email UK
        string passwordHash
        string firstName
        string lastName
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    REFRESH_TOKEN {
        string id PK
        string tokenHash
        string userId FK
        datetime expiresAt
        datetime revokedAt
        datetime createdAt
    }

    PASSWORD_RESET_TOKEN {
        string id PK
        string tokenHash UK
        string userId FK
        datetime expiresAt
        datetime usedAt
        datetime createdAt
    }

    ORGANIZATION {
        string id PK
        string name
        string slug UK
        boolean isArchived
        datetime createdAt
        datetime updatedAt
    }

    ORGANIZATION_MEMBER {
        string id PK
        string organizationId FK
        string userId FK
        enum role "OWNER | ADMIN | MEMBER | VIEWER"
        datetime createdAt
    }

    WORKSPACE {
        string id PK
        string name
        string slug
        string organizationId FK
        boolean isArchived
        datetime createdAt
        datetime updatedAt
    }

    WORKSPACE_MEMBER {
        string id PK
        string workspaceId FK
        string userId FK
        enum role "OWNER | ADMIN | MEMBER | VIEWER"
        datetime invitedAt
        datetime joinedAt
    }

    PROJECT {
        string id PK
        string name
        string description
        string workspaceId FK
        boolean isArchived
        datetime createdAt
        datetime updatedAt
    }

    TASK {
        string id PK
        string projectId FK
        string title
        string description
        enum status "TODO | IN_PROGRESS | REVIEW | DONE"
        enum priority "LOW | MEDIUM | HIGH | URGENT"
        datetime dueDate
        string[] labels
        string assigneeId FK
        string reporterId FK
        datetime createdAt
        datetime updatedAt
    }

    COMMENT {
        string id PK
        string taskId FK
        string authorId FK
        string body
        datetime createdAt
        datetime updatedAt
    }

    ATTACHMENT {
        string id PK
        string taskId FK
        string uploaderId FK
        string originalName
        string storageKey
        string mimeType
        int sizeBytes
        datetime createdAt
    }

    NOTIFICATION {
        string id PK
        string userId FK
        enum type "TASK_ASSIGNED | TASK_COMPLETED | COMMENT_ADDED | USER_INVITED | TASK_DUE_REMINDER | WEEKLY_SUMMARY"
        json payload
        datetime readAt
        datetime createdAt
    }

    AUDIT_LOG {
        string id PK
        string userId FK
        string action
        string entityType
        string entityId
        json previousValue
        json newValue
        datetime createdAt
    }
```

## Notes

- **Organization vs. workspace roles are independent.** `OrganizationMember.role` and `WorkspaceMember.role` both use the same `WorkspaceRole` enum (`OWNER > ADMIN > MEMBER > VIEWER`) but are separate rows — a user's role in an organization does not determine their role in any specific workspace inside it.
- **Tasks/comments/attachments carry no `workspaceId` of their own.** Workspace membership for these is resolved by joining up the chain (`task -> project -> workspace`), centralized in `WorkspaceAccessService` (see [`ARCHITECTURE.md`](ARCHITECTURE.md)) rather than duplicated per-entity.
- **`AuditLog` is generic**, not one table per entity — `entityType` + `entityId` identify what changed, `previousValue`/`newValue` hold the before/after snapshot as JSON, satisfying requirement §15 (Audit Logs) without a table explosion.
- **Soft-delete is partial today**: `Organization`, `Workspace`, and `Project` carry `isArchived` (reversible archive, not deletion); `Task`/`Comment`/`Attachment` are hard-deleted. A true `deletedAt` column on every entity is a tracked gap, not yet implemented.
