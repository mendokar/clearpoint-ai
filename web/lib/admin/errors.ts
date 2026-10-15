/** Error de negocio del panel con su código HTTP (409 slug/SKU duplicado, 404, transición inválida…). */
export class AdminStoreError extends Error {
  constructor(
    public status: number,
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "AdminStoreError";
  }
}
