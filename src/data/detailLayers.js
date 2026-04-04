import usStatesAdmin1Url from './us-states-admin1.geojson?url';
import europeAdmin1Url from './europe-admin1.geojson?url';
import northernEuropeAdmin1Url from './northern-europe-admin1.geojson?url';

export const DETAIL_LAYER_DEFINITIONS = Object.freeze([
  {
    id: 'us-states-admin1',
    cacheKey: 'us-states-admin1',
    label: 'US state detail',
    url: usStatesAdmin1Url,
    simplifyTolerance: 0.0016,
    minZoomMultiplier: 7,
  },
  {
    id: 'europe-admin1',
    cacheKey: 'europe-admin1',
    label: 'Europe admin1 detail',
    url: europeAdmin1Url,
    simplifyTolerance: 0.0008,
    minZoomMultiplier: 8,
  },
  {
    id: 'northern-europe-admin1',
    cacheKey: 'northern-europe-admin1',
    label: 'Northern Europe admin1 detail',
    url: northernEuropeAdmin1Url,
    simplifyTolerance: 0.0005,
    minZoomMultiplier: 8,
  },
]);
