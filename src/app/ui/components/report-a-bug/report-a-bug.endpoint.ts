/**
 * Where a bug report is posted.
 *
 * The endpoint is configuration, not a constant: it lives in
 * `environment.bugReportEndpoint` so a deployment decides where its reports go,
 * and it is empty unless one does. An unset endpoint means the feature is not
 * configured, which the form reports the same way it reports a refused post.
 */
export const BUG_REPORT_FAILURE_MESSAGE =
  'Failed to submit bug report. Please try again or contact the developer directly.';

/** The configured endpoint, or `null` when this deployment has not set one. */
export function resolveBugReportEndpoint(
  configured: string | null | undefined,
): string | null {
  const endpoint = (configured ?? '').trim();
  return endpoint.length > 0 ? endpoint : null;
}
