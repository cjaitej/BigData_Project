// Shared solar-wind driver-type colors/labels — kept as a util (rather than
// inlined in Threat Escalation, currently its only consumer) so any future
// view that colors by driver type reuses the same category → color mapping.
export const SW_TYPES = ['slow_stream', 'fast_stream', 'cme_ejecta', 'unknown']

export const SW_TYPE_COLOR = {
  slow_stream: '#60a5fa',
  fast_stream: '#4ade80',
  cme_ejecta:  '#f87171',
  unknown:     '#7C8496',
}

export const SW_TYPE_LABEL = {
  slow_stream: 'Slow stream',
  fast_stream: 'Fast stream',
  cme_ejecta:  'CME ejecta',
  unknown:     'Unknown',
}
