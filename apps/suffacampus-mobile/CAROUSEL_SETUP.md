# School Carousel Image Setup Guide

## How to Add/Edit Carousel Images

The carousel images are fetched from Firebase Firestore. Users can easily change images and text through the Firebase Console.

### Firebase Structure

**Collection:** `carousel`

**Document Fields:**
- `uri` (string) - Image URL
- `title` (string) - Main heading text
- `subtitle` (string) - Subheading text
- `order` (number) - Display order (1, 2, 3, etc.)

### Adding Images via Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: **SuffaCampus-fa194**
3. Navigate to **Firestore Database**
4. Find or create collection: `carousel`
5. Add a new document with these fields:

```
uri: "https://your-image-url.com/image.jpg"
title: "Your Title Here"
subtitle: "Your Subtitle Here"
order: 1
```

### Example Documents

#### Document 1:
```
uri: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80"
title: "Welcome to Our School"
subtitle: "Excellence in Education"
order: 1
```

#### Document 2:
```
uri: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&q=80"
title: "Campus Life"
subtitle: "Building Future Leaders"
order: 2
```

### Image Requirements

- **Format:** JPG, PNG, WebP
- **Resolution:** Minimum 1200x800px (recommended)
- **Aspect Ratio:** 16:9 or wider works best
- **File Size:** Keep under 500KB for fast loading
- **Hosting:** Upload to Firebase Storage or use external URLs

### Uploading Images to Firebase Storage

1. Go to Firebase Console â†’ **Storage**
2. Click **Upload file**
3. Select your school image
4. After upload, click on the file
5. Copy the **Download URL**
6. Use this URL in the carousel document's `uri` field

### Quick Setup Script

Run this in your app (one time) to populate initial data:

```typescript
import { collection, setDoc, doc } from "firebase/firestore";
import { db } from "./firebase";

const setupCarousel = async () => {
  const images = [
    {
      uri: "YOUR_IMAGE_URL_1",
      title: "Welcome to ABC School",
      subtitle: "Building Tomorrow's Leaders",
      order: 1
    },
    {
      uri: "YOUR_IMAGE_URL_2",
      title: "Modern Facilities",
      subtitle: "State of the Art Infrastructure",
      order: 2
    },
    {
      uri: "YOUR_IMAGE_URL_3",
      title: "Sports & Activities",
      subtitle: "Holistic Development",
      order: 3
    }
  ];

  for (const image of images) {
    await setDoc(doc(collection(db, "carousel")), image);
  }
  
  console.log("Carousel setup complete!");
};
```

### Features

âœ… **Full-width display** - Images span entire screen width
âœ… **Smooth swiping** - Horizontal scroll with snap behavior
âœ… **Auto indicators** - Dots show current slide position
âœ… **Text overlay** - Title and subtitle with gradient background
âœ… **Dynamic loading** - Changes reflect immediately in app
âœ… **Fallback images** - Default images if Firestore is empty

### Tips

- Use high-quality, relevant school images
- Keep titles short (3-6 words)
- Keep subtitles concise (4-8 words)
- Update regularly to keep content fresh
- Order field determines display sequence

