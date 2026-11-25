/** The xdvipdfmx step's files: everything XeTeX's run saw (assets, resources such as the logo and figures, aux files) plus its XDV, since xdvipdfmx embeds the images XeTeX only measured. */
export function pdfInputs(texInputs: ReadonlyMap<string, Uint8Array>, xdv: Uint8Array): Map<string, Uint8Array> {
  const files = new Map(texInputs);
  files.set('main.xdv', xdv);
  return files;
}
