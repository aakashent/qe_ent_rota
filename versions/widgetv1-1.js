/*
 * Title: QE Rota Information Widget
 * Version: 1.1
 * Changes: Added ability to see tomorrow using multiple widgets
 */

// Set qerota_silentmode to true before importing the module
Keychain.set("qerota_silentmode", "true");
console.log("Silent mode set to 'true'.");

// Import the main function from the module (if exists)
let main;
let updateCheckAvailable = true;
try {
  main = importModule('QERota_Installer');
  console.log("Update-checking module imported successfully.");
} catch (error) {
  updateCheckAvailable = false;
  console.log("Update-checking module not available. Skipping update check.");
}

// URL to the Google Sheet with rota information
const url = "https://docs.google.com/spreadsheets/d/1vZYhWEk_30QCUfcT1TBXd_oT34nRc8YAUlytehfSfRk/export?format=csv&gid=1290877730";

// Fetch the data from the Google Sheet
let req = new Request(url);
let csv = await req.loadString();

// Parse CSV data
let rows = csv.trim().split("\n").map(row => row.split(","));
if (rows.length < 2) {
  throw new Error("No data found in the sheet.");
}

// Handle argument (today or tomorrow, with error handling for invalid values)
let argument = (args.widgetParameter != null) ? parseInt(args.widgetParameter) : 0;
if (isNaN(argument)) argument = 0;  // Default to 0 if argument is invalid

let errorOccurred = false;
if (argument > 1) {
  argument = 0;  // Default to 0 if argument is greater than 1
  errorOccurred = true;  // Trigger error message
}

// Adjust the row based on the argument (2 for today, 3 for tomorrow)
let rowToAssess = 2 + argument;

// Limit to first 3 columns (A-C), skipping the date column
let headers = rows[0].slice(1, 4); // Headers from A1-C1 (first 3 titles)
let data = rows[rowToAssess].slice(1, 4);    // Data from A2 or A3 based on argument

// Ensure data is available
if (!headers || !data) {
  throw new Error("Failed to retrieve data from the Google Sheet.");
}

// Create a small widget
let widget = new ListWidget();
widget.url = "scriptable:///run/QE%20Contact%20On%20Call";  // Set the widget to run the Scriptable script

// Set up widget background and text styles for light and dark modes
if (Device.isUsingDarkAppearance()) {
  widget.backgroundColor = new Color("#1c1c1c");
} else {
  widget.backgroundColor = new Color("#ffffff");
}

// Add date as a header with larger font and no label
let dateText = widget.addText(rows[rowToAssess][0]);  // First cell is the date
dateText.font = Font.boldSystemFont(16);
dateText.centerAlignText(); // Center the date at the top
widget.addSpacer(8); // Add some space after the date

// Create a vertical stack with spacers on both sides for central alignment
let mainStack = widget.addStack();
mainStack.layoutHorizontally(); // Create horizontal stack to add spacers on both sides

// Add left spacer for central alignment
mainStack.addSpacer();

// Create vertical stack for the actual content
let contentStack = mainStack.addStack();
contentStack.layoutVertically();
contentStack.centerAlignContent(); // Center the content inside this stack

// Display the first three rows: title in bold, result underneath
for (let i = 0; i < headers.length; i++) {
  let rowStack = contentStack.addStack();
  rowStack.layoutVertically();
  
  // Add title (header) in bold
  let headerText = rowStack.addText(headers[i]);
  headerText.font = Font.boldSystemFont(12);
  headerText.centerAlignText();  // Center align the title
  headerText.lineLimit = 1;

  rowStack.addSpacer(2); // Add small space between title and data
  
  // Add corresponding data underneath
  let dataText = rowStack.addText(data[i]);
  dataText.font = Font.regularSystemFont(12);
  dataText.centerAlignText();  // Center align the data
  dataText.lineLimit = 1;
  
  // Spacer between rows
  contentStack.addSpacer(8);
}

// Add right spacer for central alignment
mainStack.addSpacer();

// Perform silent update check and mark the widget if an update is available
let markerStack = widget.addStack(); // Create a horizontal stack for the error and update marker
markerStack.layoutHorizontally();

// Add error message if the argument was invalid
if (errorOccurred) {
  let errorText = markerStack.addText("⚠️");
  errorText.font = Font.mediumSystemFont(10);
  errorText.textColor = Color.red();
  errorText.leftAlignText();  // Align the text to the left
}

markerStack.addSpacer();  // Spacer between the error message and update marker

async function checkForUpdatesAndMark() {
  if (updateCheckAvailable) {
    await main();  // Call the main update-checking function

    // Retrieve the stored update status from the keychain
    let updateStatus = Keychain.get("qerota_updateAvailable");
    console.log(`Update check result: ${updateStatus}`);

    // If an update is available, mark it in the bottom right of the widget
    if (updateStatus === "true") {
      let updateText = markerStack.addText("⬇️");
      updateText.font = Font.mediumSystemFont(10);
      updateText.textColor = Color.red();
      updateText.rightAlignText();  // Align the text to the right
    }
  } else {
    console.log("Skipping update check due to missing module.");
  }
}

// Call the function to check for updates silently and mark the widget if needed
await checkForUpdatesAndMark();

// Reset silent mode before completing the script
Keychain.set("qerota_silentmode", "false");
console.log("Silent mode set to 'false'.");

// Finalise and display the widget
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentSmall();
}
Script.complete();