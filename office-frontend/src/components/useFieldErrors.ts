import { useEffect, useState } from 'react'
import { fieldErrorsOf, type FieldErrors } from '../lib/fieldErrors'

/**
 * The messages under the fields of one form, from the mask's own checks and from the backend.
 *
 * <p>The mask's checks stay silent until the first attempt to save: a form that complains
 * before anybody typed is noise. After that they follow the input, so a message goes away as
 * soon as the field is fixed. A message from the backend stands until the next attempt.
 *
 * <p>When an attempt fails, the focus goes to the first field with a message — inside the
 * dialog on top, when there is one — so the user lands where the work is.
 *
 * @param validate the mask's own checks, message per field, empty when all is well
 * @param serverError what the last request threw, `null` when it did not fail
 * @param prefix the path of the nested object this form edits, see {@link fieldErrorsOf}
 * @returns `errors`, the messages to draw; `own`, the part of them the mask found itself;
 *   `check` to call on save, true when the form may be sent; and `reset` for a form that starts
 *   over, such as a dialog opened again
 */
export function useFieldErrors(
  validate: () => FieldErrors,
  serverError: unknown,
  prefix = '',
): { errors: FieldErrors; own: FieldErrors; check: () => boolean; reset: () => void } {
  const [attempts, setAttempts] = useState(0)

  const own = attempts > 0 ? validate() : {}
  const errors = { ...fieldErrorsOf(serverError, prefix), ...own }

  useEffect(() => {
    if (attempts > 0 || serverError) focusFirstInvalid()
  }, [attempts, serverError])

  const check = () => {
    setAttempts((count) => count + 1)
    return Object.keys(validate()).length === 0
  }

  return { errors, own, check, reset: () => setAttempts(0) }
}

/** Puts the focus on the first field marked wrong, in the dialog on top or on the page. */
function focusFirstInvalid(): void {
  const dialogs = document.querySelectorAll('[role="dialog"]')
  const scope = dialogs.length > 0 ? dialogs[dialogs.length - 1] : document
  scope.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}
