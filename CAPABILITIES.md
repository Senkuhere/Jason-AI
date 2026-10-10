# Jason Capabilities

Jason receives these capabilities dynamically from `capability-registry.js`.

## File Capabilities

### read_project_file

Reads a text file inside the project.

Input:

- `filePath`

Side effects:

- None

Failure cases:

- File does not exist
- Path is outside the project
- `.env` access is attempted
- File is too large

### write_project_file

Writes complete text content to a project file.

Input:

- `filePath`
- `content`

Side effects:

- Creates or overwrites a file

Failure cases:

- Invalid path
- Path outside the project
- `.env` access
- Invalid content

### create_folder_directory

Creates a project directory.

Input:

- `directoryPath`

Side effects:

- Creates directories

### edit_project_file

Replaces one exact section of a file.

Input:

- `filePath`
- `oldText`
- `newText`

Side effects:

- Modifies an existing file

Failure cases:

- Text is missing
- Text is not found
- Text appears more than once
- Protected or invalid path

### append_project_file

Appends text to an existing file.

Input:

- `filePath`
- `content`

Side effects:

- Modifies a file

### list_project_directory

Lists files and directories.

Input:

- `directoryPath`
- `recursive`

Side effects:

- None

## Utility Capabilities

### calculator

Performs safe arithmetic calculations.

Input:

- `expression`

Side effects:

- None

### get_current_date

Returns the current date and time for the configured timezone.

Side effects:

- None

### get_weather

Retrieves current weather information.

Input:

- `query`

Required configuration:

- `OPENWEATHER_API_KEY`

Side effects:

- Makes OpenWeather API requests

Failure cases:

- Missing API key
- Invalid location
- API failure
- Network failure

### search_web

Searches the web for current information.

Input:

- `query`
- `maxResults`

Required configuration:

- `TAVILY_API_KEY`

Side effects:

- Makes Tavily API requests

Failure cases:

- Missing API key
- Invalid request
- Rate limit
- Network failure

### open_web_page

Opens an HTTP or HTTPS URL in the default browser.

Input:

- `url`

Side effects:

- Opens a webpage

Failure cases:

- Invalid URL
- Unsupported protocol

## Computer Information Capabilities

### get_computer_hardware_info

Reads safe hardware information.

Returns:

- CPU model
- Logical CPU count
- CPU speed
- Total memory
- Free memory
- Architecture
- Endianness

Side effects:

- None

### get_operating_system_info

Reads operating system information.

Returns:

- Operating system
- Platform
- Release
- Version
- Architecture
- Node.js version

Side effects:

- None

### check_network_status

Checks service reachability and latency.

Checks:

- Internet
- Gemini
- OpenAI
- Tavily
- OpenWeather

Side effects:

- Makes network requests

### get_jason_health

Checks Jason's runtime condition.

Checks:

- Database configuration
- Database connection
- Long-term-memory table
- Short-term-memory file
- Configured providers
- Configured services
- Node.js runtime

Side effects:

- May check the database

### list_capabilities

Checks Jason's current capabilities

## Error Handling

Capability failures are caught centrally by Jason's agent loop.

A failed capability should:

1. Throw a clear `Error`.
2. Include a useful reason.
3. Never expose secrets.
4. Never claim success.
5. Allow Jason to explain the failure.

## Testing

Run all tests with:

```bash
npm test