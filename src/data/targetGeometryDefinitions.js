const closeRing = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return [];
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first?.[0] === last?.[0] && first?.[1] === last?.[1]) {
    return coordinates;
  }

  return [...coordinates, first];
};

const getSignedArea = (coordinates) => {
  const ring = closeRing(coordinates);
  if (ring.length < 4) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    area += current[0] * next[1] - next[0] * current[1];
  }

  return area * 0.5;
};

const orientRing = (coordinates, clockwise) => {
  const ring = closeRing(coordinates);
  if (ring.length < 4) {
    return ring;
  }

  const isClockwise = getSignedArea(ring) < 0;
  if (isClockwise === clockwise) {
    return ring;
  }

  return closeRing(ring.slice(0, -1).reverse());
};

const polygon = (coordinates, options = {}) => ({
  type: 'Polygon',
  coordinates: [
    orientRing(coordinates, false),
    ...((options.holes ?? []).map((hole) => orientRing(hole, true))),
  ],
  ...(options.excludeLand ? { excludeLand: true } : {}),
  ...(options.landClipPoints
    ? { landClipPoints: options.landClipPoints.map((point) => [...point]) }
    : {}),
});

export const TARGET_GEOMETRY_DEFINITIONS = Object.freeze({
  'water-north-sea': polygon(
    [
      [-10.5, 50.1],
      [9.8, 50.1],
      [13.2, 57.8],
      [8.8, 62.9],
      [-5.8, 62.9],
      [-10.8, 56.2],
    ],
    {
      excludeLand: true,
      landClipPoints: [
        [-2.5, 54.5],  // Great Britain
        [-8.0, 53.3],  // Ireland
        [5.2, 52.3],   // Netherlands
        [4.6, 50.8],   // Belgium
        [2.2, 50.9],   // France
        [8.5, 53.7],   // Germany
        [9.6, 56.1],   // Denmark
        [8.5, 61.1],   // Norway
        [12.1, 57.7],  // Sweden
      ],
    },
  ),
  'water-baltic-sea': polygon(
    [
      [9.0, 53.8],
      [30.8, 53.8],
      [31.2, 66.8],
      [13.9, 66.8],
      [8.8, 56.0],
    ],
    {
      excludeLand: true,
      landClipPoints: [
        [11.0, 55.7],  // Denmark
        [18.6, 60.1],  // Sweden
        [25.7, 61.9],  // Finland
        [25.0, 58.6],  // Estonia
        [24.6, 56.9],  // Latvia
        [23.9, 55.2],  // Lithuania
        [19.1, 52.0],  // Poland
        [10.5, 54.5],  // Germany
        [30.3, 59.9],  // Russia
      ],
    },
  ),
  'water-english-channel': polygon(
    [
      [-6.5, 48.5],
      [2.4, 48.5],
      [2.2, 51.4],
      [-4.4, 51.6],
      [-6.7, 49.8],
    ],
    { excludeLand: true },
  ),
  'water-mediterranean': polygon(
    [
      [-5.8, 35.0],
      [7.5, 36.0],
      [16.0, 36.0],
      [25.8, 34.5],
      [36.5, 32.0],
      [36.5, 40.8],
      [14.5, 45.5],
      [0.0, 43.8],
      [-5.8, 40.0],
    ],
    { excludeLand: true },
  ),
  'water-black-sea': polygon(
    [
      [27.0, 40.6],
      [41.8, 40.6],
      [41.5, 47.5],
      [28.0, 47.0],
      [27.0, 43.0],
    ],
    { excludeLand: true },
  ),
  'water-adriatic-sea': polygon(
    [
      [12.1, 39.2],
      [20.2, 39.2],
      [19.0, 45.8],
      [12.3, 45.8],
    ],
    { excludeLand: true },
  ),
  'water-aegean-sea': polygon(
    [
      [22.0, 35.0],
      [29.8, 35.0],
      [29.8, 41.8],
      [22.0, 41.8],
    ],
    { excludeLand: true },
  ),
  'water-bay-of-biscay': polygon(
    [
      [-10.6, 42.4],
      [-1.4, 42.4],
      [-0.6, 48.5],
      [-8.8, 48.8],
    ],
    { excludeLand: true },
  ),
  'water-atlantic-ocean': polygon(
    [
      [-60.0, 41.0],
      [6.0, 43.0],
      [8.0, 69.5],
      [-22.0, 75.0],
      [-60.0, 66.0],
    ],
    {
      excludeLand: true,
      landClipPoints: [
        [-19.0, 64.9], // Iceland
        [-8.2, 53.3],  // Ireland
        [-2.5, 54.5],  // Great Britain
        [6.5, 61.0],   // Norway
        [-8.7, 43.2],  // Spain
        [-1.0, 47.0],  // France
      ],
    },
  ),
  'water-arctic-ocean': polygon(
    [
      [-10.0, 71.0],
      [33.0, 71.0],
      [33.0, 78.5],
      [-10.0, 78.5],
    ],
    { excludeLand: true },
  ),
  'area-scandinavia': polygon([
    [4.0, 55.0],
    [13.0, 54.7],
    [23.5, 58.5],
    [31.0, 64.0],
    [28.0, 71.5],
    [15.5, 71.8],
    [6.0, 67.0],
    [4.0, 60.0],
  ]),
});
