export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const event = req.body;

  if (!event.email) {
    return res.status(200).send("No email provided");
  }

  const email = event.email;

  // Step 1: Fetch full contact data from Brevo
  const contactResponse = await fetch(
    `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
    {
      method: "GET",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  if (!contactResponse.ok) {
    return res.status(200).send("Contact fetch failed");
  }

  const contactData = await contactResponse.json();
  const fullName = contactData.attributes?.FULL_NAME;

  if (!fullName) {
    return res.status(200).send("No FULL_NAME found");
  }

  // Step 2: Split the name
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.shift();
  const lastName = parts.join(" ") || "";

  // Step 3: Update contact with split values
  await fetch(
    `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
    {
      method: "PUT",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        attributes: {
          FIRSTNAME: firstName,
          LASTNAME: lastName
        }
      })
    }
  );

  return res.status(200).send("Updated");
}
