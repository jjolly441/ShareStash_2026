// src/components/NativeMap.tsx
// Native version — re-exports react-native-maps
import MapViewComponent, { Marker as MarkerComponent } from 'react-native-maps';

export const MapView = MapViewComponent;
export const Marker = MarkerComponent;
export default MapViewComponent;