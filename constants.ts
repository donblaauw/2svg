
export const A3_SHORT = 842;
export const A3_LONG = 1191;

export const getA3Dimensions = (orientation: 'portrait' | 'landscape') => {
  return orientation === 'portrait' 
    ? { width: A3_SHORT, height: A3_LONG }
    : { width: A3_LONG, height: A3_SHORT };
};
