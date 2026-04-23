export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const email = req.body.email;
  if (!email) return res.status(200).send("No email");

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return res.status(200).send("Missing API key");

  // Fetch full contact from Brevo
  const contactResponse = await fetch(
    `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
    {
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json"
      }
    }
  );

  if (!contactResponse.ok) {
    return res.status(200).send("Fetch failed");
  }

  const contactData = await contactResponse.json();

  // ===== NAME SPLIT =====
  const fullName = contactData.attributes?.FULL_NAME;

  let firstName = null;
  let lastName = null;

  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts.shift();
    lastName = parts.join(" ") || "";
  }

  // ===== DATE FORMAT FIX =====
  const rawDate = contactData.attributes?.DATE_CREATED;

  let formattedDate = null;

  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!isNaN(parsed)) {
      formattedDate = parsed.toISOString().split("T")[0]; // YYYY-MM-DD
    }
  }

  // ===== UPDATE CONTACT =====
  const updatePayload = {
    attributes: {}
  };

  if (firstName) updatePayload.attributes.FIRSTNAME = firstName;
  if (lastName !== null) updatePayload.attributes.LASTNAME = lastName;
  if (formattedDate) updatePayload.attributes.DATE_CREATED = formattedDate;

  if (Object.keys(updatePayload.attributes).length === 0) {
    return res.status(200).send("Nothing to update");
  }

  await fetch(
    `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
    {
      method: "PUT",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(updatePayload)
    }
  );

  return res.status(200).send("Updated");
}
