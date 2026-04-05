# Admin Configuration Setup Guide

This guide explains how to configure various dashboard settings through Firebase Firestore.

## Results Display Configuration

The dashboard can display a configurable number of recent results based on admin settings.

### Setting Up Results Display Count

1. **Open Firebase Console**: Go to [Firebase Console](https://console.firebase.google.com/)

2. **Navigate to Firestore Database**:
   - Select your project (SuffaCampus-fa194)
   - Click on "Firestore Database" in the left menu
   - Click "Data" tab

3. **Create Config Collection**:
   - Click "+ Start collection"
   - Collection ID: `appConfig`
   - Click "Next"

4. **Add Configuration Document**:
   - Document ID: Leave as "Auto-ID" or use `main`
   - Add field:
     - Field: `resultsDisplayCount`
     - Type: `number`
     - Value: Enter desired number (e.g., 3, 5, 7, or any number)
   - Click "Save"

### Configuration Fields

| Field Name | Type | Description | Default Value |
|------------|------|-------------|---------------|
| `resultsDisplayCount` | number | Number of recent results to display on student dashboard | 3 |

### Example Configuration

```json
{
  "resultsDisplayCount": 5
}
```

This will display 5 most recent results on the student dashboard.

### How It Works

1. **Default Behavior**: If no configuration is found in Firestore, the app defaults to displaying 3 results
2. **Dynamic Updates**: When you change the `resultsDisplayCount` value in Firestore, students will see the updated number of results after restarting the app
3. **No Code Changes Required**: Admins can control the display count entirely through Firestore without any code modifications

### Testing

To test different display counts:

1. Change `resultsDisplayCount` in Firestore (e.g., from 3 to 7)
2. Restart the app
3. The dashboard will now show 7 recent results instead of 3

### Future Configuration Options

You can extend this system to control other dashboard elements:
- `carouselAutoplay`: Enable/disable carousel auto-scroll
- `attendanceRefreshInterval`: How often to refresh attendance data
- `assignmentsDisplayCount`: Number of assignments to show
- `dashboardTheme`: Color scheme preferences

Simply add new fields to the `appConfig` document in Firestore.

