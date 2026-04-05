# School Branding Configuration

## Quick Setup

Edit the file `config/school.config.ts` to customize your school's branding.

## Configuration Options

### 1. School Information
```typescript
name: "International Academy",     // Your school name
code: "SCHOOL2024",                // Default school code
tagline: "Excellence in Education", // School tagline
```

### 2. Logo Setup

**Option A: Use Icon (Default)**
```typescript
logo: {
  useIcon: true,
  iconName: "school",              // MaterialCommunityIcons name
  iconColor: "#4C6EF5",           // Icon color
}
```

**Option B: Use Custom Image**
```typescript
logo: {
  useIcon: false,
  imageUrl: "https://yourschool.com/logo.png", // Logo URL
}
```

### 3. Contact Information
```typescript
contact: {
  supportEmail: "support@yourschool.edu",
  supportPhone: "+60 12-345 6789",
  helpUrl: "https://yourschool.edu/help",
  address: "Your School Address",
}
```

### 4. Theme Colors
```typescript
colors: {
  primary: "#4C6EF5",      // Main theme color
  secondary: "#3B5BDB",    // Secondary color
}
```

## Features Now Working

✅ **Forgot Password** - Sends Firebase password reset email
✅ **Support Button** - Opens email or phone contact
✅ **Help Button** - Shows FAQs and help center
✅ **Configurable Logo** - Icon or custom image
✅ **School Branding** - Name and tagline everywhere

## Need Help?

Contact your administrator or refer to Firebase documentation for authentication features.
