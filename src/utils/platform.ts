// src/utils/platform.ts
// Platform detection utilities for web vs native
import { Platform, Dimensions } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';

export const getScreenWidth = () => Dimensions.get('window').width;
export const getScreenHeight = () => Dimensions.get('window').height;

// Responsive breakpoints
export const isDesktop = () => isWeb && getScreenWidth() >= 1024;
export const isTablet = () => getScreenWidth() >= 768 && getScreenWidth() < 1024;
export const isMobile = () => getScreenWidth() < 768;

// Max content width for desktop layouts
export const MAX_CONTENT_WIDTH = 1200;
export const CARD_MAX_WIDTH = 480;