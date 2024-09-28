/*
 * Title: QE Contact On Call
 * Version: 1.0
 * Changes: Allows Partial Match Search
 * 
 * General Description: Function to search for contact's phone number in your own contacts and provide options to call, message, or WhatsApp them. If no exact match is found, a UI picker is shown with partial matches
 * 
 * 
 */

const nicknameMap = {
  "jonathan": ["jon", "john"],
  "william": ["bill", "will"],
  "robert": ["bob"],
  "michael": ["mike"],
  "katherine": ["kate", "kathy"],
  // Add more mappings as needed
};

async function searchForSpecificName(firstName, lastName) {
  try {
    // Normalize the first and last names (trim spaces and convert to lowercase)
    let searchFirstName = firstName.trim().toLowerCase();
    let searchLastName = lastName.trim().toLowerCase();

    // Get all contact containers
    let containers = await ContactsContainer.all();

    // Fetch all contacts from the containers
    let contacts = await Contact.all(containers);

    // Filter contacts by last name
    let filteredContacts = contacts.filter(contact => {
      let contactLastName = (contact.familyName || '').trim().toLowerCase();
      return contactLastName === searchLastName;  // Exact match on last name
    });

    // First try to find an exact or nickname match for the first name
    let exactMatch = filteredContacts.filter(contact => {
      let contactFirstName = (contact.givenName || '').trim().toLowerCase();
      return contactFirstName === searchFirstName || (nicknameMap[searchFirstName] || []).includes(contactFirstName);
    });

    // If exact match found, return the contacts
    if (exactMatch.length > 0) {
      return exactMatch;
    }

    // If no exact match, find partial matches for the first name in either direction
    let partialMatches = filteredContacts.filter(contact => {
      let contactFirstName = (contact.givenName || '').trim().toLowerCase();
      return contactFirstName.includes(searchFirstName) || searchFirstName.includes(contactFirstName);
    });

    // If no partial matches, return an empty array
    if (partialMatches.length === 0) {
      return [];
    }

    // Show UI picker for partial matches
    let table = new UITable();
    table.showSeparators = true;

    for (let contact of partialMatches) {
      let row = new UITableRow();
      let fullName = `${contact.givenName || ''} ${contact.familyName || ''}`.trim();
      row.addText(fullName);
      row.dismissOnSelect = true;
      row.onSelect = async (idx) => {
        console.log("Selected: " + fullName);
        // Return the selected contact
        return contact;
      };
      table.addRow(row);
    }

    await table.present();
    return partialMatches;  // Return the partial matches for further processing

  } catch (error) {
    console.error("Error accessing contacts: " + error);
    return [];
  }
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
  
  let response = await alert.presentAlert();
  if (response === -1) return;  // If cancel is selected, exit
  
  let selectedName = data[response].trim();  // Get the selected name

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
