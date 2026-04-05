// School Configuration
// Build-time defaults — overridden at runtime by values from the backend
// (stored in AsyncStorage after school selection).

import AsyncStorage from "@react-native-async-storage/async-storage";

export const SCHOOL_CONFIG = {
  // School Information (defaults — replaced by backend values when available)
  name: "International Academy",
  code: "SCHOOL2024",
  tagline: "Excellence in Education",
  
  // Logo Configuration
  logo: {
    // Option 1: Use icon (set useIcon to true)
    useIcon: true,
    iconName: "school", // MaterialCommunityIcons name
    iconColor: "#4C6EF5",
    
    // Option 2: Use image URL (set useIcon to false)
    // useIcon: false,
    // imageUrl: "https://your-school.com/logo.png",
  },
  
  // Contact Information
  contact: {
    supportEmail: "support@internationalacademy.edu",
    supportPhone: "+60 12-345 6789",
    helpUrl: "https://internationalacademy.edu/help",
    address: "123 Education Street, Knowledge City",
  },
  
  // Theme Colors
  colors: {
    primary: "#4C6EF5",
    secondary: "#3B5BDB",
  },
};

/**
 * Load school config with runtime overrides from AsyncStorage.
 * Falls back to SCHOOL_CONFIG defaults for any missing values.
 */
export async function getSchoolConfig(): Promise<typeof SCHOOL_CONFIG> {
  try {
    const [name, tagline, supportEmail, supportPhone, helpUrl, primaryColor] =
      await AsyncStorage.multiGet([
        "schoolName",
        "schoolTagline",
        "schoolSupportEmail",
        "schoolSupportPhone",
        "schoolHelpUrl",
        "schoolPrimaryColor",
      ]);

    return {
      ...SCHOOL_CONFIG,
      name: name[1] ?? SCHOOL_CONFIG.name,
      tagline: tagline[1] ?? SCHOOL_CONFIG.tagline,
      contact: {
        ...SCHOOL_CONFIG.contact,
        supportEmail: supportEmail[1] ?? SCHOOL_CONFIG.contact.supportEmail,
        supportPhone: supportPhone[1] ?? SCHOOL_CONFIG.contact.supportPhone,
        helpUrl: helpUrl[1] ?? SCHOOL_CONFIG.contact.helpUrl,
      },
      colors: {
        ...SCHOOL_CONFIG.colors,
        primary: primaryColor[1] ?? SCHOOL_CONFIG.colors.primary,
      },
    };
  } catch {
    return SCHOOL_CONFIG;
  }
}
