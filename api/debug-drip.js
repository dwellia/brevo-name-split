export default async function handler(req, res) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return res.status(500).send("Missing API key");

  const TEMP_LIST_ID = 12;
  const blockedDomains = ["booking.com", "vrbo.com", "airbnb.com"];

  const tempResponse = await fetch(
    `https://api.brevo.com/v3/contacts/lists/${TEMP_LIST_ID}/contacts/get?limit=10&offset=0`,
    {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }
  );

  if (!tempResponse.ok) {
    const err = await tempResponse.text();
    return res.status(500).send(`Failed to fetch list 12: ${err}`);
  }

  const tempData = await tempResponse.json();
  const contacts = tempData.contacts || [];

  if (contacts.length === 0) {
    return res.status(200).send("No contacts found in list 12.");
  }

  const report = contacts.map(c => ({
    email: c.email || "(no email)",
    FIRSTNAME: c.attributes?.FIRSTNAME || "(missing)",
    LASTNAME: c.attributes?.LASTNAME || "(missing)",
    SOURCE_DATE: c.attributes?.SOURCE_DATE || "(missing)",
    isOTA: blockedDomains.some(d => (c.email || "").toLowerCase().includes(d)),
    hasName: !!c.attributes?.FIRSTNAME,
    wouldDrip: !!c.attributes?.FIRSTNAME && !blockedDomains.some(d => (c.email || "").toLowerCase().includes(d))
  }));

  return res.status(200).json({
    totalInList: tempData.count,
    sample: report
  });
}
