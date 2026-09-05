import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '../../components/useDebouncedValue'
import {
  fetchFiscalYearPreview,
  fiscalYearPreviewKey,
  suggestFiscalYearEnd,
  suggestFiscalYearStart,
} from '../../lib/accounting'
import { isCompleteIsoDate } from '../../lib/format'
import type { FiscalYear, FiscalYearProposal, FiscalYearRequest } from '../../lib/types'

/**
 * The four fields of a fiscal year, and the pre-fill behind them.
 *
 * <p><b>One form, two places.</b> The dialog of the fiscal year screen and step 2 of the setup
 * wizard show the same four fields, pre-filled the same way, with the same tick for the following
 * year. A second pre-fill calculation beside this one would run alike for two years and fall
 * apart on the first short fiscal year.
 *
 * <p>The pre-fill itself is not worked out here either: the dates come from
 * `suggestFiscalYearStart` / `suggestFiscalYearEnd`, and name, series and following year come
 * from `GET /fiscal-years/preview` — the calculator of the backend, asked while somebody types.
 */

/** What the form edits. `null` means «nobody has typed here», so the proposal shows through. */
export type YearForm = {
  label: string | null
  numberYear: string | null
  startDate: string
  endDate: string
  createFollowingYear: boolean
}

/** Everything the two screens need from the form: what stands in it, and what may be sent. */
export type FiscalYearFormState = {
  form: YearForm
  set: <K extends keyof YearForm>(field: K, value: YearForm[K]) => void
  /** What the label field shows: what somebody typed, else the proposal. */
  label: string
  /** What the series field shows, likewise. */
  numberYear: string
  /** The following year the preview offers, `null` where it offers none. */
  following: FiscalYearProposal | null
  /** Why the period cannot be created; empty where it can. */
  error: string
  /** What is unusual about it and worth reading; empty where nothing is. */
  warning: string
  /** Whether all four fields are filled in and the period is legal. */
  complete: boolean
  /** What would be sent, or `undefined` while the form is not complete. */
  request: FiscalYearRequest | undefined
}

/**
 * The state of the form, pre-filled.
 *
 * @param tenantId the tenant
 * @param years the fiscal years the tenant already keeps
 * @param fiscalYearStartMonth in which month the fiscal year of this tenant begins
 * @param editing the year being changed, absent while one is being created
 * @returns the state the fields and the screen around them read
 */
export function useFiscalYearForm(
  tenantId: number,
  years: readonly FiscalYear[],
  fiscalYearStartMonth: number,
  editing?: FiscalYear,
): FiscalYearFormState {
  const creating = editing === undefined
  const [form, setForm] = useState<YearForm>(() => {
    if (editing !== undefined) {
      return {
        label: editing.label,
        numberYear: `${editing.numberYear}`,
        startDate: editing.startDate,
        endDate: editing.endDate,
        createFollowingYear: false,
      }
    }
    const startDate = suggestFiscalYearStart(years, fiscalYearStartMonth, new Date())
    return {
      label: null,
      numberYear: null,
      startDate,
      endDate: suggestFiscalYearEnd(startDate),
      // Set from the start: the closing run lays the following year out anyway, and without it
      // the sales desk stands still on the 2nd of January.
      createFollowingYear: true,
    }
  })

  const set = <K extends keyof YearForm>(field: K, value: YearForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  // What is asked is what would be sent: the two dates and, where somebody has typed over the
  // proposal, the name and the series as well. Only what somebody typed travels — folding the
  // answer of the calculator back into the question would ask again for every answer.
  //
  // One debounced string and not four debounced values, because the request has to carry the
  // whole state of the form at once. The name is percent-encoded, so no separator can hide in
  // something somebody typed.
  const asked = useDebouncedValue(
    [
      form.startDate,
      form.endDate,
      encodeURIComponent(form.label ?? ''),
      completeNumberYear(form.numberYear),
    ].join('|'),
    250,
  )
  const [start, end, askedLabel, askedSeries] = asked.split('|')
  const typedLabel = decodeURIComponent(askedLabel)
  const typedNumberYear = askedSeries === '' ? undefined : Number(askedSeries)
  const askPreview = creating && isCompleteIsoDate(start) && isCompleteIsoDate(end)

  const preview = useQuery({
    queryKey: fiscalYearPreviewKey(tenantId, start, end, typedLabel, typedNumberYear),
    queryFn: () => fetchFiscalYearPreview(tenantId, start, end, typedLabel, typedNumberYear),
    enabled: askPreview,
  })

  // The proposal shows through wherever nobody has typed — worked out during render, so no
  // effect writes into the form and no keystroke gets overwritten by a late answer.
  const label = form.label ?? preview.data?.label ?? ''
  const numberYear =
    form.numberYear ?? (preview.data === undefined ? '' : `${preview.data.numberYear}`)

  const following = preview.data?.following ?? null
  const error = preview.data?.error ?? ''
  const warning = preview.data?.warning ?? ''
  const complete =
    label.trim() !== ''
    && numberYear.trim() !== ''
    && isCompleteIsoDate(form.startDate)
    && isCompleteIsoDate(form.endDate)
    && error === ''

  return {
    form,
    set,
    label,
    numberYear,
    following,
    error,
    warning,
    complete,
    request: complete
      ? {
          label: label.trim(),
          numberYear: Number(numberYear),
          startDate: form.startDate,
          endDate: form.endDate,
          createFollowingYear: creating && following !== null && form.createFollowingYear,
        }
      : undefined,
  }
}

/**
 * A series is asked for only once four digits stand there.
 *
 * <p>Otherwise every keystroke of «2027» would ask for the years 2, 20 and 202 in turn, and the
 * answer to those is a sentence about a year nobody meant.
 */
function completeNumberYear(typed: string | null): string {
  const value = (typed ?? '').trim()
  return /^\d{4}$/.test(value) ? value : ''
}
