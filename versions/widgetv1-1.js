/*
 * Title: QE Rota Information Widget
 * Version: 1.1
 * Changes: Improved data fetching and minor bug fixes.
 * 
 * General Description: This widget fetches the rota information from a public Google Sheet and displays the date and the following: Consultant, Day SpR, Night SpR.
 * 
 * 
 */


// URL to the Google Sheet with rota information
const url = "https://docs.google.com/spreadsheets/d/1vZYhWEk_30QCUfcT1TBXd_oT34nRc8YAUlytehfSfRk/export?format=csv&gid=1290877730";
const openUrl = "https://tinyurl.com/QEENTMonthlyRota";

// Fetch the data from the Google Sheet
let req = new Request(url);
let csv = await req.loadString();

// Parse CSV data
let rows = csv.trim().split("\n").map(row => row.split(","));
if (rows.length < 2) {
  throw new Error("No data found in the sheet.");
}

// Limit to first 3 columns (A-C), skipping the date column
let headers = rows[0].slice(1, 4); // Headers from A1-C1 (first 3 titles)
let data = rows[2].slice(1, 4);    // Data from A2-C2 (first 3 data points)

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
let dateText = widget.addText(rows[2][0]);  // First cell is the date
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
async function checkForUpdatesAndMark() {
  
  // Set qerota_silentmode to true before importing the module
Keychain.set("qerota_silentmode", "true");
console.log("Silent mode set to 'true'.");

// Import the main function from the module
const main = importModule('QERota_Installer');

  await main();  // Call the main update-checking function

  // Retrieve the stored update status from the keychain
  let updateStatus = Keychain.get("qerota_updateAvailable");
  console.log(`Update check result: ${updateStatus}`);

  // If an update is available, mark it in the bottom right of the widget
  if (updateStatus === "true") {
    let markerStack = widget.addStack();
    markerStack.addSpacer();  // Align marker to the bottom right
    let updateText = markerStack.addText("⬇️ Update");
    updateText.font = Font.mediumSystemFont(10);
    updateText.textColor = Color.red();
    updateText.rightAlignText();  // Align the text to the right
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
