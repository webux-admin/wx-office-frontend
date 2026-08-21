import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { showFile } from '../lib/files'

/**
 * Asks the server to draw a stored form on a made up document and shows the PDF.
 *
 * <p>Reading, not writing: whoever may see which forms exist may look at them. The designer
 * has a preview of its own, because while blocks are being dragged there is nothing stored
 * yet — this one is for the forms that already exist.
 *
 * @param tenantId the tenant, null while none is chosen
 * @param documentTypeId the kind of document to pretend the sample is; without it the sample
 *        carries the name of the form and shows tax
 */
export function useLayoutPreview(tenantId: number | null, documentTypeId?: number) {
  return useMutation({
    mutationFn: (layoutId: number) =>
      api.file(
        `/api/tenants/${tenantId}/print-layouts/${layoutId}/preview`
        + (documentTypeId === undefined ? '' : `?documentTypeId=${documentTypeId}`),
      ),
    onSuccess: showFile,
  })
}
