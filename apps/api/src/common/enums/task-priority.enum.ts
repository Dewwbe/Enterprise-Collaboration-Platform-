// Mirrors the Prisma TaskPriority enum (see workspace-role.enum.ts for why these
// are kept as plain TS enums rather than imported from the generated Prisma client).
export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}
