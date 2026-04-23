export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const event = req.body;

  // Only process contact events
  if (
    event.event !== "contact_created" &&
    event.event !== "contact_updated" &&
    event.event !== "contact_added_to_list"
  ) {
    return res.status(200).send("Ignored");
  }

  const email = event.email;
  const fullName = event.attributes?.FULL_NAME;

  if (!email || !fullName) {
    return res.status(200).send("No name to split");
  }

  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.shift();
  const lastName = parts.join(" ") || "";

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
