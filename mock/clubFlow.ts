export interface ClubAdmin {
  /** UUID del club — para los endpoints /clubs/:id/*. */
  id: string;
  name: string;
  city: string;
}

export const mockClubAdmin: ClubAdmin = {
  // UUID real — coincide con clubId en server/test/seed.ts ("Club Deportivo Bosques"),
  // para poder probar los endpoints /clubs/:id/* contra el backend real.
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Club Deportivo Bosques',
  city: 'CDMX',
};
