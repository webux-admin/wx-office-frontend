import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { OpenLineQuantity } from '../../lib/types'

/**
 * Asks what is still open on a document, for one kind of follow-up to take over.
 *
 * <p>The answer depends on both documents: what a Lieferschein already took out of an Auftrag
 * says nothing about what the Rechnung still has to charge for. `resource` therefore names
 * the kind being written, not the kind of the source — and it is that kind's read right that
 * guards the endpoint.
 *
 * @param tenantId the tenant
 * @param resource the REST segment of the kind being written, for example `delivery-notes`
 * @param sourceId the document that would be taken over, undefined while none is picked
 * @param enabled  false keeps the query from running at all, for a mask that may not ask
 */
export function useOpenQuantities(
  tenantId: number,
  resource: string,
  sourceId: number | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['document-open-quantities', resource, tenantId, sourceId],
    queryFn: () =>
      api.get<OpenLineQuantity[]>(
        `/api/tenants/${tenantId}/${resource}/predecessors/${sourceId}/open-quantities`,
      ),
    enabled: enabled && sourceId !== null && sourceId !== undefined,
  })
}
