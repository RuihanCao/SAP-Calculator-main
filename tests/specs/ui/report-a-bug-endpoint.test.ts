import { describe, expect, it } from 'vitest';
import {
  BUG_REPORT_FAILURE_MESSAGE,
  resolveBugReportEndpoint,
} from 'app/ui/components/report-a-bug/report-a-bug.endpoint';

describe('bug report endpoint', () => {
  it('is unconfigured when the environment carries no value', () => {
    expect(resolveBugReportEndpoint('')).toBeNull();
    expect(resolveBugReportEndpoint('   ')).toBeNull();
    expect(resolveBugReportEndpoint(undefined)).toBeNull();
    expect(resolveBugReportEndpoint(null)).toBeNull();
  });

  it('is the configured url, trimmed, once a deployment sets one', () => {
    expect(resolveBugReportEndpoint(' https://example.test/report ')).toBe(
      'https://example.test/report',
    );
  });

  it('carries the message the form already shows when a report cannot be sent', () => {
    expect(BUG_REPORT_FAILURE_MESSAGE).toContain('Failed to submit bug report');
  });
});
