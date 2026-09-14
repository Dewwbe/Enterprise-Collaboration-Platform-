export const USER_INVITED_EVENT = 'user.invited';

export type InviteScope = 'organization' | 'workspace';

export class UserInvitedEvent {
  constructor(
    public readonly scope: InviteScope,
    public readonly scopeId: string,
    public readonly scopeName: string,
    public readonly invitedUserId: string,
    public readonly invitedById: string,
    public readonly role: string,
  ) {}
}
