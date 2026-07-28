using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

public class Script : ScriptBase
{
    private const string DefaultLookerInstanceUrl = "INPUT_VALUE_HERE";

    public override async Task<HttpResponseMessage> ExecuteAsync()
    {
        try
        {
            string accessToken = GetAccessTokenFromContext();
            string lookerUrl = GetLookerInstanceUrl();

            HttpResponseMessage response;
            if (this.Context.OperationId.Equals("ExecuteUserMcp", StringComparison.OrdinalIgnoreCase))
            {
                response = await ForwardMcpRequestAsync(accessToken, lookerUrl);
            }
            else
            {
                response = await ForwardPassthroughRequestAsync(accessToken, lookerUrl);
            }

            return response;
        }
        catch (Exception ex)
        {
            this.Context.Request.Headers.TryAddWithoutValidation("X-Debug-Error-Message", ex.Message);

            var errObj = new JObject
            {
                ["error"] = "Looker Request Execution Failed",
                ["message"] = ex.Message
            };

            var errResp = new HttpResponseMessage(HttpStatusCode.BadRequest)
            {
                Content = new StringContent(errObj.ToString(Newtonsoft.Json.Formatting.None), Encoding.UTF8, "application/json")
            };
            CopyRequestDebugHeadersToResponse(errResp);
            return errResp;
        }
    }

    private string GetLookerInstanceUrl()
    {
        if (!string.IsNullOrWhiteSpace(DefaultLookerInstanceUrl) &&
            DefaultLookerInstanceUrl != "INPUT_VALUE_HERE" &&
            Uri.TryCreate(DefaultLookerInstanceUrl, UriKind.Absolute, out var userUri))
        {
            return userUri.ToString().TrimEnd('/');
        }

        if (this.Context.Request?.RequestUri != null && this.Context.Request.RequestUri.IsAbsoluteUri)
        {
            var reqUri = this.Context.Request.RequestUri;
            return $"{reqUri.Scheme}://{reqUri.Authority}".TrimEnd('/');
        }

        throw new InvalidOperationException("Invalid Looker Instance URL. Please specify a valid absolute URL in DefaultLookerInstanceUrl.");
    }

    private string GetAccessTokenFromContext()
    {
        string rawAuth = this.Context.Request.Headers.Authorization?.ToString()?.Trim();
        if (string.IsNullOrWhiteSpace(rawAuth) && this.Context.Request.Headers.TryGetValues("Authorization", out var authValues))
        {
            rawAuth = authValues.FirstOrDefault()?.Trim();
        }

        if (string.IsNullOrWhiteSpace(rawAuth))
        {
            throw new InvalidOperationException("Missing access token. Ensure an OAuth 2.0 connection or Authorization header is provided.");
        }

        int spaceIdx = rawAuth.IndexOf(' ');
        string token = spaceIdx >= 0 ? rawAuth.Substring(spaceIdx + 1).Trim() : rawAuth;
        this.Context.Request.Headers.TryAddWithoutValidation("X-Debug-Access-Token", token);
        return token;
    }

    private void SetAuthHeader(HttpRequestMessage req, string accessToken)
    {
        req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {accessToken}");
    }

    private void CopyRequestDebugHeadersToResponse(HttpResponseMessage response)
    {
        if (response?.Headers == null || this.Context.Request?.Headers == null) return;
        foreach (var header in this.Context.Request.Headers.Where(h => h.Key.StartsWith("X-Debug-", StringComparison.OrdinalIgnoreCase)))
        {
            string val = header.Value?.FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(val))
            {
                response.Headers.Remove(header.Key);
                response.Headers.TryAddWithoutValidation(header.Key, val);
            }
        }
    }

    private async Task<HttpResponseMessage> ForwardMcpRequestAsync(string accessToken, string lookerUrl)
    {
        string payloadString = "{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"tools/list\",\"params\":{}}";
        if (this.Context.Request.Content != null)
        {
            string bodyStr = await this.Context.Request.Content.ReadAsStringAsync();
            if (!string.IsNullOrWhiteSpace(bodyStr) && bodyStr.Trim() != "{}" && bodyStr.Trim() != "[]")
            {
                payloadString = bodyStr;
            }
        }

        var req = new HttpRequestMessage(HttpMethod.Post, $"{lookerUrl}/mcp");
        SetAuthHeader(req, accessToken);
        req.Headers.Accept.Clear();
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Content = new StringContent(payloadString, Encoding.UTF8, "application/json");

        HttpResponseMessage response = await this.Context.SendAsync(req, this.CancellationToken);

        CopyRequestDebugHeadersToResponse(response);

        if (!response.IsSuccessStatusCode)
        {
            string errDetails = await response.Content.ReadAsStringAsync();
            return FormatDetailedErrorResponse(response.StatusCode, $"MCP Request Failed ({response.StatusCode})", errDetails);
        }

        return response;
    }

    private async Task<HttpResponseMessage> ForwardPassthroughRequestAsync(string accessToken, string lookerUrl)
    {
        var originalUri = this.Context.Request.RequestUri;
        var targetBaseUri = new Uri(lookerUrl);

        string cleanPath = originalUri.AbsolutePath;
        int apiIdx = cleanPath.IndexOf("/api/", StringComparison.OrdinalIgnoreCase);
        if (apiIdx >= 0)
        {
            cleanPath = cleanPath.Substring(apiIdx);
        }
        else
        {
            int mcpIdx = cleanPath.IndexOf("/mcp", StringComparison.OrdinalIgnoreCase);
            if (mcpIdx >= 0)
            {
                cleanPath = cleanPath.Substring(mcpIdx);
            }
        }

        string basePath = targetBaseUri.AbsolutePath.TrimEnd('/');
        string finalPath = basePath + cleanPath;

        var targetUriBuilder = new UriBuilder(targetBaseUri)
        {
            Path = finalPath,
            Query = originalUri.Query.TrimStart('?')
        };

        var req = new HttpRequestMessage(this.Context.Request.Method, targetUriBuilder.Uri);
        SetAuthHeader(req, accessToken);
        req.Headers.Accept.Clear();
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        if (this.Context.Request.Content != null)
        {
            string bodyStr = await this.Context.Request.Content.ReadAsStringAsync();
            if (!string.IsNullOrWhiteSpace(bodyStr))
            {
                string mediaType = this.Context.Request.Content.Headers.ContentType?.MediaType ?? "application/json";
                req.Content = new StringContent(bodyStr, Encoding.UTF8, mediaType);
            }
        }

        HttpResponseMessage response = await this.Context.SendAsync(req, this.CancellationToken);

        CopyRequestDebugHeadersToResponse(response);

        if (!response.IsSuccessStatusCode)
        {
            string errDetails = await response.Content.ReadAsStringAsync();
            return FormatDetailedErrorResponse(response.StatusCode, $"Looker API Request Failed ({response.StatusCode})", errDetails);
        }

        if (this.Context.OperationId.Equals("ConversationalAnalyticsChat", StringComparison.OrdinalIgnoreCase))
        {
            string rawContent = await response.Content.ReadAsStringAsync();
            if (!string.IsNullOrWhiteSpace(rawContent))
            {
                string trimmed = rawContent.Trim();
                if (!trimmed.StartsWith("{") || !trimmed.EndsWith("}"))
                {
                    string textValue = trimmed;
                    if (trimmed.StartsWith("\"") && trimmed.EndsWith("\""))
                    {
                        try
                        {
                            textValue = JToken.Parse(trimmed).ToString();
                        }
                        catch
                        {
                            // Fall back to trimmed string
                        }
                    }

                    var obj = new JObject
                    {
                        ["message"] = textValue,
                        ["response"] = textValue
                    };

                    response.Content = new StringContent(obj.ToString(Newtonsoft.Json.Formatting.None), Encoding.UTF8, "application/json");
                }
            }
        }

        return response;
    }

    private HttpResponseMessage FormatDetailedErrorResponse(HttpStatusCode statusCode, string title, string details)
    {
        var errObj = new JObject
        {
            ["error"] = title,
            ["upstream_status_code"] = (int)statusCode
        };

        if (!string.IsNullOrWhiteSpace(details))
        {
            try
            {
                errObj["details"] = JToken.Parse(details);
            }
            catch
            {
                errObj["details"] = details;
            }
        }

        HttpStatusCode responseStatusCode = (statusCode == HttpStatusCode.Unauthorized || statusCode == HttpStatusCode.Forbidden)
            ? HttpStatusCode.BadRequest
            : statusCode;

        var errResp = new HttpResponseMessage(responseStatusCode)
        {
            Content = new StringContent(errObj.ToString(Newtonsoft.Json.Formatting.None), Encoding.UTF8, "application/json")
        };
        CopyRequestDebugHeadersToResponse(errResp);
        return errResp;
    }
}
