# sample-data

Put your Instagram export here (the unzipped folder, the `.zip`, or just the
`saved_posts.json` / `saved_collections.json` files). Everything in this folder
except this README is git-ignored, so it never ends up on GitHub.

Then run:

```bash
npm run inspect            # scans ./sample-data
npm run inspect -- path/to/export.zip
```

It prints which files were found, how they are structured, and what the app's
parser extracts from them. Usernames are masked in the output.
