/**
 * OpenTelemetryExporter — Phase 20 Observability Platform
 * 
 * Formats trace contexts and performance latency metrics into OTLP-compliant JSON structures.
 */
class OpenTelemetryExporter {
  /**
   * Translates trace parameters and times into a standard OpenTelemetry Span.
   */
  static exportSpan(traceContext, operationName, durationMs) {
    if (!traceContext) return null;
    
    // Normalize IDs to OTel format constraints (hex strings)
    const traceIdHex = traceContext.traceId.replace(/[^a-f0-9]/gi, '').padEnd(32, '0').substring(0, 32);
    const spanIdHex = Math.random().toString(16).substring(2).padEnd(16, '0').substring(0, 16);
    const parentSpanIdHex = traceContext.parentTraceId 
      ? traceContext.parentTraceId.replace(/[^a-f0-9]/gi, '').padEnd(16, '0').substring(0, 16) 
      : undefined;

    return {
      traceId: traceIdHex,
      spanId: spanIdHex,
      parentSpanId: parentSpanIdHex,
      name: operationName,
      kind: 'SPAN_KIND_INTERNAL',
      startTimeUnixNano: new Date(traceContext.createdAt || new Date()).getTime() * 1000000,
      endTimeUnixNano: (new Date(traceContext.createdAt || new Date()).getTime() + durationMs) * 1000000,
      attributes: [
        { key: 'correlationId', value: { stringValue: traceContext.correlationId } },
        { key: 'causationId', value: { stringValue: traceContext.causationId || '' } },
        { key: 'traceMode', value: { stringValue: traceContext.mode } }
      ],
      status: { code: 'STATUS_CODE_OK' }
    };
  }
}

module.exports = OpenTelemetryExporter;
