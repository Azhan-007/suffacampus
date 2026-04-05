# Events & News Management Guide

Complete guide for admins to manage Events & News through Firebase Firestore.

## Setting Up Events Collection

1. **Open Firebase Console**: [Firebase Console](https://console.firebase.google.com/)
2. **Navigate to Firestore Database**: Select project → Firestore Database → Data tab
3. **Create Events Collection**: Click "+ Start collection" → Collection ID: `events`

## Adding a New Event

### Required Fields

| Field Name | Type | Description | Example |
|------------|------|-------------|---------|
| `title` | string | Event name | "Mid-Term Examination" |
| `date` | string | Event date/period | "March 15-20, 2026" |
| `icon` | string | Material icon name | "clipboard-text" |
| `color` | string | Hex color code | "#4C6EF5" |
| `isActive` | boolean | Show/hide event | true |
| `startDate` | timestamp | Event start (for sorting) | Firestore Timestamp |

### Step-by-Step: Add Event

1. In Firestore, go to `events` collection
2. Click "+ Add document"
3. Document ID: Auto-generate or use custom ID
4. Add fields with values:

```json
{
  "title": "Annual Sports Day",
  "date": "February 10, 2026",
  "icon": "trophy",
  "color": "#F59E0B",
  "isActive": true,
  "startDate": "2026-02-10T00:00:00Z"
}
```

5. Click "Save"

## Available Icon Names

Choose from these Material Community Icons:

**Academic Events:**
- `clipboard-text` - Examinations
- `book-open-variant` - Study sessions
- `school` - Academic programs
- `certificate` - Graduation/Awards

**Sports & Activities:**
- `trophy` - Sports events
- `soccer` - Football
- `basketball` - Basketball
- `medal` - Competitions

**Cultural Events:**
- `drama-masks` - Drama/Theatre
- `music` - Music programs
- `palette` - Art exhibitions
- `camera` - Photography

**General:**
- `bullhorn` - Announcements
- `party-popper` - Celebrations
- `calendar-star` - Special events
- `flask` - Science events

## Color Palette Suggestions

**Blue (Academic):** `#4C6EF5`  
**Yellow (Sports):** `#F59E0B`  
**Green (Success):** `#10B981`  
**Red (Important):** `#EF4444`  
**Purple (Cultural):** `#8B5CF6`  
**Orange (Events):** `#F97316`

## Managing Events

### Activate/Deactivate Event
- Set `isActive: true` to show event
- Set `isActive: false` to hide event (without deleting)

### Edit Event
1. Click on event document in Firestore
2. Edit any field
3. Click "Update"

### Delete Event
1. Click on event document
2. Click "Delete document"
3. Confirm deletion

### Reorder Events
Events are automatically sorted by `startDate` (ascending). To change order:
1. Edit the `startDate` field
2. Earlier dates appear first

## Example Events

### Mid-Term Exam
```json
{
  "title": "Mid-Term Examination",
  "date": "March 15-20, 2026",
  "icon": "clipboard-text",
  "color": "#4C6EF5",
  "isActive": true,
  "startDate": "2026-03-15T00:00:00Z"
}
```

### Sports Day
```json
{
  "title": "Annual Sports Day",
  "date": "February 10, 2026",
  "icon": "trophy",
  "color": "#F59E0B",
  "isActive": true,
  "startDate": "2026-02-10T00:00:00Z"
}
```

### Science Fair
```json
{
  "title": "Science Exhibition",
  "date": "March 5, 2026",
  "icon": "flask",
  "color": "#10B981",
  "isActive": true,
  "startDate": "2026-03-05T00:00:00Z"
}
```

### Parent-Teacher Meeting
```json
{
  "title": "Parent-Teacher Meeting",
  "date": "February 25, 2026",
  "icon": "account-group",
  "color": "#8B5CF6",
  "isActive": true,
  "startDate": "2026-02-25T00:00:00Z"
}
```

## Testing

1. Add an event in Firestore
2. Restart the app
3. Event appears in "Events & News" section on dashboard
4. Set `isActive: false` to hide
5. Restart app → event no longer visible

## Display Limit

- Default: Shows up to 5 active events
- Events are sorted by start date (earliest first)
- Only events with `isActive: true` are shown

## Best Practices

✅ Use clear, concise event titles  
✅ Include specific dates or date ranges  
✅ Choose appropriate icons that match event type  
✅ Use consistent color coding (e.g., blue for academic, yellow for sports)  
✅ Keep events updated (mark past events as inactive)  
✅ Test on mobile device after making changes  

❌ Don't use generic titles like "Event 1"  
❌ Don't mix too many bright colors  
❌ Don't leave old events active indefinitely  
❌ Don't forget to set isActive field
