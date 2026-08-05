export interface ClubAdmin {
  /** UUID del club — para los endpoints /clubs/:id/*. */
  id: string;
  /** UUID del usuario club_admin logueado — para invited_by en /club-invitations. */
  adminUserId: string;
  name: string;
  city: string;
}

export const mockClubAdmin: ClubAdmin = {
  // UUIDs reales — coinciden con clubId/clubAdminUserId en server/test/seed.ts
  // ("Club Deportivo Bosques" / "Laura Ibarra"), para poder probar los endpoints
  // /clubs/:id/* y POST /club-invitations contra el backend real.
  id: '00000000-0000-0000-0000-000000000001',
  adminUserId: '00000000-0000-0000-0000-000000000007',
  name: 'Club Deportivo Bosques',
  city: 'CDMX',
};
