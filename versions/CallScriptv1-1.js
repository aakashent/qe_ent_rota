/*
 * Title: QE Contact On Call
 * Version: 1.1
 * Changes: Allows Partial Match Search
 * 
 * General Description: Function to search for contact's phone number in your own contacts and provide options to call, message, or WhatsApp them. If no exact match is found, a UI picker is shown with partial matches
 * 
 * 
 */

// Set qerota_silentmode to true before importing the module
Keychain.set("qerota_silentmode", "true");
console.log("Silent mode set to 'true'.");

// Variable to track if the module import was successful
let updateCheckAvailable = true;


// Function to check for updates silently and add an option if an update is available
async function checkForUpdatesAndModifyMenu(alert) {
  
  // Try to import the update-checking module
let main;
try {
  main = importModule('QERota_Installer');
  console.log("Update-checking module imported successfully.");
} catch (error) {
  updateCheckAvailable = false;
  console.log("Update-checking module not available. Skipping update check.");
}
  
  if (updateCheckAvailable) {
    await main();  // Call the main update-checking function

    // Retrieve the stored update status from the keychain
    let updateStatus = Keychain.get("qerota_updateAvailable");
    console.log(`Update check result: ${updateStatus}`);

    // If an update is available, add an extra option to the alert menu
    if (updateStatus === "true") {
      alert.addAction("Update Available ⬇️");
    }
  } else {
    console.log("Skipping update check due to missing module.");
  }
  
  // Reset silent mode before completing the script
Keychain.set("qerota_silentmode", "false");
console.log("Silent mode set to 'false'.");
}

/*
 * Main function to allow selection of Consultant, Day SpR, or Night SpR and contact them
 */
async function showContactOptions() {
  const url = "https://docs.google.com/spreadsheets/d/1vZYhWEk_30QCUfcT1TBXd_oT34nRc8YAUlytehfSfRk/export?format=csv&gid=1290877730";
  
  // Fetch the data from the Google Sheet
  let req = new Request(url);
  let csv = await req.loadString();
  
  // Parse CSV data
  let rows = csv.trim().split("\n").map(row => row.split(","));
  if (rows.length < 2) {
    throw new Error("No data found in the sheet.");
  }
  
  // Limit to first 3 columns (Consultant, Day SpR, Night SpR)
  let data = rows[2].slice(1, 4);  // Data from A2-C2 (Consultant, Day SpR, Night SpR)
  
  // Menu to select which person to contact
  let alert = new Alert();
  alert.title = "Select Contact";
  alert.message = "Who would you like to contact?";
  alert.addAction("Consultant: " + data[0]);
  alert.addAction("Day SpR: " + data[1]);
  alert.addAction("Night SpR: " + data[2]);
  alert.addCancelAction("Cancel");

  // Call the function to check for updates and modify the menu
  await checkForUpdatesAndModifyMenu(alert);
  
  let response = await alert.presentAlert();
  if (response === -1) return;  // If cancel is selected, exit

  let selectedName;
  
  // If an update is selected, handle it (response corresponds to the update option being the last one)
  if (updateCheckAvailable && response === 3) {
    console.log("Update option selected. Redirecting to the update page...");
    Safari.open("scriptable:///run/QERota_Installer");  // Replace with the actual update link
    return;
  } else {
    // If not the update option, continue with the normal flow
    selectedName = data[response].trim();  // Get the selected name
  }

  // Split the selected name into first and last name
  let [firstName, lastName] = selectedName.split(' ');

  // Use the searchForSpecificName function to find the selected person's contact details
  let foundContacts = await searchForSpecificName(firstName, lastName);

  // If no contacts found, show an alert
  if (foundContacts.length === 0) {
    let noContactAlert = new Alert();
    noContactAlert.title = "Contact Not Found";
    noContactAlert.message = `No contact found for ${selectedName}`;
    noContactAlert.addCancelAction("OK");
    await noContactAlert.presentAlert();
    return;
  }

  // Get the first found contact or the selected contact from the picker
  let contact = foundContacts[0];

  // Check if the contact has phone numbers
  if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) {
    let noPhoneAlert = new Alert();
    noPhoneAlert.title = "No Phone Number";
    noPhoneAlert.message = `${selectedName} has no phone number listed.`;
    noPhoneAlert.addCancelAction("OK");
    await noPhoneAlert.presentAlert();
    return;
  }

  // Get the first phone number of the contact
  let phoneNumber = contact.phoneNumbers[0].value;

  // Function to format the phone number for WhatsApp (add country code, remove leading 0)
  function formatForWhatsApp(number) {
    let cleanedNumber = number.replace(/\D/g, '');  // Strip non-digit characters
    if (cleanedNumber.startsWith('0')) {
      cleanedNumber = '44' + cleanedNumber.slice(1);  // Replace leading '0' with '+44'
    }
    return cleanedNumber;
  }

  // Try to format the phone number for WhatsApp
  let whatsAppNumber = formatForWhatsApp(phoneNumber);

  // Show options to call, message, or WhatsApp
  let contactAlert = new Alert();
  contactAlert.title = `Contact ${selectedName}`;
  contactAlert.message = `What would you like to do with ${phoneNumber}?`;
  contactAlert.addAction("Call");
  contactAlert.addAction("Message");
  contactAlert.addAction("WhatsApp");
  contactAlert.addCancelAction("Cancel");
  
  let contactResponse = await contactAlert.presentAlert();
  
  // Handle the selection
  switch (contactResponse) {
    case 0:  // Call
      Safari.open(`tel:${phoneNumber}`);
      break;
    case 1:  // Message
      Safari.open(`sms:${phoneNumber}`);
      break;
    case 2:  // WhatsApp
      Safari.open(`https://wa.me/${whatsAppNumber}`);
      break;
    default:
      // Cancel or invalid response, do nothing
      break;
  }
}

// Run the main function
await showContactOptions();
