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

const polygon = (coordinates) => ({
  type: 'Polygon',
  coordinates: [closeRing(coordinates)],
});

export const TARGET_GEOMETRY_DEFINITIONS = Object.freeze({
  'water-north-sea': polygon([
    [-6.5, 51.0],
    [-2.0, 50.7],
    [4.2, 51.6],
    [8.8, 54.4],
    [8.1, 58.8],
    [2.2, 61.6],
    [-4.8, 60.1],
    [-7.3, 56.4],
  ]),
  'water-baltic-sea': polygon([
    [9.0, 54.2],
    [15.5, 53.5],
    [24.8, 54.4],
    [30.2, 60.2],
    [26.8, 66.8],
    [18.5, 66.9],
    [12.0, 63.0],
    [9.2, 57.0],
  ]),
  'water-english-channel': polygon([
    [-6.5, 48.5],
    [2.4, 48.5],
    [2.2, 51.4],
    [-4.4, 51.6],
    [-6.7, 49.8],
  ]),
  'water-mediterranean': polygon([
    [-5.8, 35.0],
    [7.5, 36.0],
    [16.0, 36.0],
    [25.8, 34.5],
    [36.5, 32.0],
    [36.5, 40.8],
    [14.5, 45.5],
    [0.0, 43.8],
    [-5.8, 40.0],
  ]),
  'water-black-sea': polygon([
    [27.0, 40.6],
    [41.8, 40.6],
    [41.5, 47.5],
    [28.0, 47.0],
    [27.0, 43.0],
  ]),
  'water-adriatic-sea': polygon([
    [12.1, 39.2],
    [20.2, 39.2],
    [19.0, 45.8],
    [12.3, 45.8],
  ]),
  'water-aegean-sea': polygon([
    [22.0, 35.0],
    [29.8, 35.0],
    [29.8, 41.8],
    [22.0, 41.8],
  ]),
  'water-bay-of-biscay': polygon([
    [-10.6, 42.4],
    [-1.4, 42.4],
    [-0.6, 48.5],
    [-8.8, 48.8],
  ]),
  'water-atlantic-ocean': polygon([
    [-29.0, 56.0],
    [-10.0, 56.0],
    [-6.0, 61.0],
    [-9.0, 67.5],
    [-18.0, 69.0],
    [-27.0, 66.0],
  ]),
  'water-arctic-ocean': polygon([
    [-10.0, 71.0],
    [33.0, 71.0],
    [33.0, 78.5],
    [-10.0, 78.5],
  ]),
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
