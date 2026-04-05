# Timetable Management Guide for Admins

Complete guide for managing school timetables through Firebase Firestore.

## Firestore Collection Structure

**Collection Name:** `timetables`

Each document represents one class period for a specific class on a specific day.

## Setting Up Timetables

### Step 1: Access Firestore Database
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `SuffaCampus-fa194`
3. Navigate to: **Firestore Database** â†’ **Data** tab

### Step 2: Create Timetables Collection
1. Click **"+ Start collection"**
2. Collection ID: `timetables`
3. Click **"Next"**

## Adding Class Periods

### Required Fields for Each Period

| Field Name | Type | Description | Example |
|------------|------|-------------|---------|
| `classId` | string | Class identifier | "10A", "10B", "9C" |
| `day` | string | Day of week | "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" |
| `periodNumber` | number | Period order (for sorting) | 1, 2, 3, 4, 5 |
| `subject` | string | Subject name | "Mathematics" |
| `teacher` | string | Teacher name | "Dr. Sarah Ahmed" |
| `startTime` | string | Start time (24h format) | "08:00", "09:15" |
| `endTime` | string | End time (24h format) | "09:00", "10:15" |
| `room` | string | Room/Location | "Room 101", "Lab 203" |
| `color` | string | Display color (hex) | "#4C6EF5" |

### Step-by-Step: Add a Period

1. In Firestore, go to `timetables` collection
2. Click **"+ Add document"**
3. Document ID: **Auto-generate**
4. Add all required fields with values
5. Click **"Save"**

### Example: Monday Period 1 for Class 10A

```json
{
  "classId": "10A",
  "day": "Mon",
  "periodNumber": 1,
  "subject": "Mathematics",
  "teacher": "Dr. Sarah Ahmed",
  "startTime": "08:00",
  "endTime": "09:00",
  "room": "Room 101",
  "color": "#4C6EF5"
}
```

## Creating Full Week Timetable

### Recommended Workflow

1. **Decide number of periods per day** (e.g., 6 periods)
2. **Create template period times** (e.g., 08:00-09:00, 09:15-10:15, etc.)
3. **Add periods for Monday** (all 6 periods)
4. **Duplicate for other days** (Tuesday through Saturday)
5. **Adjust subjects/teachers** as needed per day

### Sample Full Day Schedule (Monday for Class 10A)

#### Period 1: Mathematics
```json
{
  "classId": "10A",
  "day": "Mon",
  "periodNumber": 1,
  "subject": "Mathematics",
  "teacher": "Dr. Sarah Ahmed",
  "startTime": "08:00",
  "endTime": "09:00",
  "room": "Room 101",
  "color": "#4C6EF5"
}
```

#### Period 2: Physics
```json
{
  "classId": "10A",
  "day": "Mon",
  "periodNumber": 2,
  "subject": "Physics",
  "teacher": "Prof. John Smith",
  "startTime": "09:15",
  "endTime": "10:15",
  "room": "Lab 203",
  "color": "#10B981"
}
```

#### Period 3: English
```json
{
  "classId": "10A",
  "day": "Mon",
  "periodNumber": 3,
  "subject": "English Literature",
  "teacher": "Ms. Emily Brown",
  "startTime": "10:30",
  "endTime": "11:30",
  "room": "Room 105",
  "color": "#F59E0B"
}
```

#### Break Time (Optional - can skip or add as info period)
```json
{
  "classId": "10A",
  "day": "Mon",
  "periodNumber": 4,
  "subject": "Lunch Break",
  "teacher": "---",
  "startTime": "11:30",
  "endTime": "12:00",
  "room": "Cafeteria",
  "color": "#94A3B8"
}
```

#### Period 4: Computer Science
```json
{
  "classId": "10A",
  "day": "Mon",
  "periodNumber": 5,
  "subject": "Computer Science",
  "teacher": "Mr. David Lee",
  "startTime": "12:00",
  "endTime": "13:00",
  "room": "Computer Lab",
  "color": "#8B5CF6"
}
```

#### Period 5: Chemistry
```json
{
  "classId": "10A",
  "day": "Mon",
  "periodNumber": 6,
  "subject": "Chemistry",
  "teacher": "Dr. Maria Garcia",
  "startTime": "14:00",
  "endTime": "15:00",
  "room": "Lab 301",
  "color": "#EC4899"
}
```

## Managing Multiple Classes

To add timetables for different classes, simply change the `classId` field:

- **Class 10A:** `"classId": "10A"`
- **Class 10B:** `"classId": "10B"`
- **Class 9C:** `"classId": "9C"`

Each class can have its own complete timetable for all days.

## Day Values

Always use these exact day abbreviations:
- **Monday:** `"Mon"`
- **Tuesday:** `"Tue"`
- **Wednesday:** `"Wed"`
- **Thursday:** `"Thu"`
- **Friday:** `"Fri"`
- **Saturday:** `"Sat"`

## Color Coding Suggestions

Use consistent colors for subject categories:

**Sciences:**
- Physics: `#10B981` (Green)
- Chemistry: `#EC4899` (Pink)
- Biology: `#14B8A6` (Teal)

**Mathematics:**
- Mathematics: `#4C6EF5` (Blue)
- Statistics: `#6366F1` (Indigo)

**Languages:**
- English: `#F59E0B` (Orange)
- Second Language: `#F97316` (Dark Orange)

**Technology:**
- Computer Science: `#8B5CF6` (Purple)
- IT: `#A855F7` (Light Purple)

**Arts & Sports:**
- Physical Education: `#EF4444` (Red)
- Art: `#EC4899` (Pink)
- Music: `#F43F5E` (Rose)

**Other:**
- History: `#78716C` (Stone)
- Geography: `#0EA5E9` (Sky Blue)
- Break/Lunch: `#94A3B8` (Gray)

## Editing Existing Periods

1. Navigate to `timetables` collection in Firestore
2. Find the document you want to edit
3. Click on the document
4. Edit any field
5. Click **"Update"**

## Deleting Periods

1. Navigate to the specific document
2. Click the document
3. Click **"Delete document"**
4. Confirm deletion

## Changing Number of Periods

To increase/decrease periods per day:

**To Add More Periods:**
1. Create new documents with higher `periodNumber` values
2. Use appropriate time slots

**To Reduce Periods:**
1. Delete documents with higher `periodNumber` values
2. Students will see fewer periods automatically

## Bulk Operations

### Using Firestore Import (Advanced)

For adding many periods at once:

1. Prepare a JSON file with all timetable entries
2. Use Firebase CLI or Firestore REST API
3. Import in bulk

Example JSON structure for bulk import:
```json
[
  {
    "classId": "10A",
    "day": "Mon",
    "periodNumber": 1,
    "subject": "Mathematics",
    "teacher": "Dr. Sarah Ahmed",
    "startTime": "08:00",
    "endTime": "09:00",
    "room": "Room 101",
    "color": "#4C6EF5"
  },
  {
    "classId": "10A",
    "day": "Mon",
    "periodNumber": 2,
    "subject": "Physics",
    "teacher": "Prof. John Smith",
    "startTime": "09:15",
    "endTime": "10:15",
    "room": "Lab 203",
    "color": "#10B981"
  }
]
```

## Common Time Slots

### Standard 6-Period Day
- Period 1: 08:00 - 09:00
- Period 2: 09:15 - 10:15
- Period 3: 10:30 - 11:30
- Lunch: 11:30 - 12:00
- Period 4: 12:00 - 13:00
- Period 5: 13:15 - 14:15
- Period 6: 14:30 - 15:30

### Standard 8-Period Day
- Period 1: 08:00 - 08:45
- Period 2: 08:50 - 09:35
- Period 3: 09:40 - 10:25
- Break: 10:25 - 10:40
- Period 4: 10:40 - 11:25
- Period 5: 11:30 - 12:15
- Lunch: 12:15 - 13:00
- Period 6: 13:00 - 13:45
- Period 7: 13:50 - 14:35
- Period 8: 14:40 - 15:25

## Testing Your Changes

1. Add timetable entries in Firestore
2. Open the mobile app
3. Navigate to **Timetable** page
4. Select different days (Mon-Sat)
5. Verify all periods appear correctly
6. Check colors, times, and information

## Troubleshooting

**Periods not showing:**
- Check `classId` matches student's class
- Verify `day` spelling is exact ("Mon", not "Monday")
- Ensure all required fields are filled

**Wrong order:**
- Check `periodNumber` field is correct
- Lower numbers appear first

**Missing on specific day:**
- Verify `day` field for that specific day
- Check if documents exist for that day

## Best Practices

âœ… Use consistent time formats (24-hour)  
âœ… Keep period numbers sequential (1, 2, 3...)  
âœ… Use meaningful color coding  
âœ… Include break times as periods if needed  
âœ… Test changes on mobile app after updating  
âœ… Keep teacher names consistent across entries  
âœ… Double-check room assignments  

âŒ Don't skip period numbers  
âŒ Don't use 12-hour time format (AM/PM)  
âŒ Don't use different day abbreviations  
âŒ Don't forget to set periodNumber for sorting

