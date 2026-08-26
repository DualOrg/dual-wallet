// @ts-nocheck
/* tslint:disable */
/* eslint-disable */
/**
 * Dual API
 * Dual turns the things your product issues — tickets, warranties, memberships, loyalty cards — into **smart objects**: items that belong to a named owner, look the way you design them, and carry a complete, provable record of everything that has ever happened to them.  Nothing about an object changes quietly. Every change is signed by whoever made it, priced, and written into a history that is later recorded on a public blockchain. That lets you issue a ticket, let its owner transfer it, and still prove months later exactly where it came from.  Most integrations follow the same path:  1. Create a **wallet** to sign with and an **organization** to own the work    and pay for it. 2. Design a **template** — what one of your items is — and a **face**, which    is how it looks. 3. **Mint** items from that template, then transfer, update or redeem them. 4. Read where things stand whenever you like, and let **webhooks** tell you    the moment something happens.  ## Base URL  ``` https://api.dual.network ```  Every path in this reference hangs off that address, and everything is HTTPS.  ## Signing in  There are two ways to identify yourself, and some things need neither.  | What you send | Header | When to use it | | --- | --- | --- | | An access token | `Authorization: Bearer <access_token>` | Anything done on behalf of a signed-in person | | An API key | `x-api-key: <key>` | Backend-to-backend calls with no interactive sign-in | | Nothing | — | Public information, and signing up or in |  Each endpoint below shows which of these it accepts. An endpoint with none shown is open to everyone.  ### Access tokens  Signing in — with a password, a passkey or a crypto wallet — gives you an `access_token` and a `refresh_token`.  The access token is short-lived, about fifteen minutes, and goes on every request. When it runs out, send the refresh token to `POST /auth/refresh-token` and you will get a fresh pair back, without asking the person to sign in again.  Each refresh retires the token you sent and gives you a new one, so always keep the newest pair and discard the old. If an already-used refresh token turns up again, we treat it as stolen and end that session everywhere — so never keep an old one around \"just in case\".  ### API keys  Create a key with `POST /api-keys`. You see the secret once, in that response, and never again — store it at that moment, because a lost key can only be replaced. A key belongs to the organization that made it, does only what its creator was allowed to do, lasts up to a year, and cannot be used to sign anyone in.  ### Permissions  Everything that is not public needs a permission, such as `objects.read` or `webhooks.create`. A signed-in person has the permissions their role gives them; an API key has the ones it was created with. Ask for something you do not have permission for and you get a `401` — the same answer as an expired token — so check the message before assuming the token is the problem.  ## Working in one organization at a time  Authenticated management data — objects, templates, faces, files, webhooks and keys — is scoped to one organization, and you only see organizations your credential may access. Guessing another organization\'s identifier does not cross that boundary: the resource simply reads as missing. Public endpoints are the deliberate exception; they expose only published views and network-wide figures described on those endpoints.  Which organization you are working in is decided by the token or key you send. To move to another one, call `POST /organizations/switch`; it hands back a new access token for that organization, and the refresh token you already hold carries on working.  ## Pagination  Lists come back a page at a time, under a named array, with a `next` marker whenever there is more to fetch.  ```http GET /objects?limit=25 ```  ```json {   \"objects\": [ { \"id\": \"665f1c2d4b1a2c3d4e5f6a7b\" } ],   \"next\": \"7b226964...\" } ```  Send that value back as `?next=` for the following page, keeping every other parameter the same — `sortBy` and `order` are part of what the marker means. No `next` in the response means you have reached the end.  | Parameter | Default | Notes | | --- | --- | --- | | `limit` | 25 | Between 1 and 25 | | `order` | `desc` | Newest first, or `asc` for oldest first | | `sortBy` | `id` | Resource field to sort by; use a field documented by the endpoint | | `next` | — | Treat it as a token: pass it back, never build one |  ## Filtering  Every list has filters of its own, and they all share the same way of asking for a date range:  ```http GET /objects?when_created[$gte]=2026-01-01T00:00:00Z&when_created[$lt]=2026-02-01T00:00:00Z ```  `$gt` and `$gte` set the start of the window, `$lt` and `$lte` set the end; the `e` versions include the moment itself. The `/stats` endpoints use simple `from` and `to` instead. `to` is exclusive there, so back-to-back ranges never count the same record twice.  ## Identifiers, times and amounts  - Resource identifiers are normally 24-character hexadecimal strings. - Times are UTC, written like `2026-01-01T12:00:00Z`. - DUAL balances, fees and other precise amounts are sent as strings rather   than numbers, so nothing is rounded away in transit. A field ending in   `_wei` is in wei, the smallest unit of DUAL. - Blockchain addresses start with `0x`.  ## Errors  Every failure returns the same JSON body, whatever the status:  ```json {   \"code\": 3,   \"message\": \"limit must be 25 or less\",   \"details\": {} } ```  `code` is meant for your code and never changes meaning; `message` is meant for a person reading a log and may be reworded at any time. Make decisions on the status and on `code`.  | Status | What happened | | --- | --- | | `400` | Something in the request is wrong. Fix it before trying again | | `401` | Not signed in, signed in with something expired, or not allowed to do this | | `403` | Signed in, but this particular thing is not yours to touch | | `404` | The resource does not exist or is not visible to you | | `409` | The thing is not in a state where this makes sense right now | | `422` | The request is well formed but breaks a rule | | `429` | Too many requests. Slow down | | `500` | Something went wrong on our side | | `503` | We could not take the request safely. Try again shortly |  ### Error codes  | `code` | Meaning | Usually seen with | | --- | --- | --- | | 3 | Something in the request is wrong | 400, 422 | | 5 | Not found | 404 | | 7 | Not allowed | 403 | | 8 | Too many requests | 429 | | 10 | Another request got there first — try again | 409 | | 12 | Not available | 501 | | 13 | Something went wrong on our side | 500 | | 14 | A required service is temporarily unavailable | 503 | | 16 | Not signed in | 401 |  ## How often you can call  Each token or key gets roughly 5 requests a second, and can burst to 30 for a moment. Callers with no token are counted by network address instead. Go over and you get a `429`; wait a little longer each time before retrying, with a bit of randomness so that everyone does not come back at once.  ## Finding one request again  Every response carries an `x-request-id`. Send your own on the way in and we will keep it; otherwise we make one for you. Quote it when you contact support and we can find the exact call in seconds.  ## Why an action cannot be replayed  Actions are signed by the wallet behind them, not merely sent by someone holding a token. Each signature is tied to that wallet\'s next action number, which you read from `GET /ebus/nonce`, so a copy of an old request is worthless the moment the number moves on. **Actions & fees** walks through the whole sequence.  ## Stability  We add things without warning: a new endpoint, a new optional parameter, a new field in a response. Build your side to ignore anything it does not recognise and those additions will never disturb you.  We do not take things away without warning. Anything being retired is marked `deprecated` here first, keeps working while it carries that mark, and is announced before it goes. 
 *
 * The version of the OpenAPI document: 1.0.0
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import * as runtime from '../runtime';
import {
    type ListStakingOperationsOut,
    ListStakingOperationsOutFromJSON,
    ListStakingOperationsOutToJSON,
} from '../models/ListStakingOperationsOut';
import {
    type ModelError,
    ModelErrorFromJSON,
    ModelErrorToJSON,
} from '../models/ModelError';
import {
    type NetworkConfig,
    NetworkConfigFromJSON,
    NetworkConfigToJSON,
} from '../models/NetworkConfig';
import {
    type NetworkInfo,
    NetworkInfoFromJSON,
    NetworkInfoToJSON,
} from '../models/NetworkInfo';
import {
    type NetworkStaking,
    NetworkStakingFromJSON,
    NetworkStakingToJSON,
} from '../models/NetworkStaking';
import {
    type NetworkTokenMarketData,
    NetworkTokenMarketDataFromJSON,
    NetworkTokenMarketDataToJSON,
} from '../models/NetworkTokenMarketData';
import {
    type NetworkTokenPriceHistory,
    NetworkTokenPriceHistoryFromJSON,
    NetworkTokenPriceHistoryToJSON,
} from '../models/NetworkTokenPriceHistory';
import {
    type StakingOperationType,
    StakingOperationTypeFromJSON,
    StakingOperationTypeToJSON,
} from '../models/StakingOperationType';
import {
    type StakingOperationsStats,
    StakingOperationsStatsFromJSON,
    StakingOperationsStatsToJSON,
} from '../models/StakingOperationsStats';

export interface GetNetworkTokenPriceHistoryRequest {
    /**
     * Named time window relative to now. Endpoints that also expose `from` and `to`
     * can use those parameters for an exact window instead.
     * 
     */
    timeRange?: GetNetworkTokenPriceHistoryTimeRangeEnum;
}

export interface GetStakingOperationsStatsRequest {
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetStakingOperationsStatsIntervalEnum;
    /**
     * Named time window relative to now. Endpoints that also expose `from` and `to`
     * can use those parameters for an exact window instead.
     * 
     */
    timeRange?: GetStakingOperationsStatsTimeRangeEnum;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Count only operations indexed strictly after this instant.
     */
    whenCreated$gt?: Date;
    /**
     * Count only operations indexed strictly before this instant.
     */
    whenCreated$lt?: Date;
    /**
     * Count only operations indexed at or after this instant.
     */
    whenCreated$gte?: Date;
    /**
     * Count only operations indexed at or before this instant.
     */
    whenCreated$lte?: Date;
}

export interface GetStakingOperationsTotalRequest {
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetStakingOperationsTotalIntervalEnum;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Include only operations indexed strictly after this instant.
     */
    whenCreated$gt?: Date;
    /**
     * Include only operations indexed strictly before this instant.
     */
    whenCreated$lt?: Date;
    /**
     * Include only operations indexed at or after this instant.
     */
    whenCreated$gte?: Date;
    /**
     * Include only operations indexed at or before this instant.
     */
    whenCreated$lte?: Date;
}

export interface ListStakingOperationsRequest {
    /**
     * Return only the resource with this identifier. Equivalent to fetching it by
     * path, but usable together with the other list filters.
     * 
     */
    id?: string;
    /**
     * Search the endpoint's supported text and identifier fields. Matching may be
     * an exact identifier lookup or a case-insensitive prefix search, depending on
     * the resource. Alphanumeric characters only.
     * 
     */
    autocomplete?: string;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Cursor for the next page, taken verbatim from the `next` field of the previous
     * response. Keep every other query parameter the same between pages: `sortBy`
     * and `order` are part of what the cursor means. An absent or empty `next` in a
     * response means there are no more pages.
     * 
     * The value is opaque. Do not parse it or build one yourself.
     * 
     */
    next?: string;
    /**
     * Sort direction. Defaults to `desc`, newest first.
     */
    order?: ListStakingOperationsOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return only operations by this staker address.
     */
    address?: string;
    /**
     * Return only operations from this transaction.
     */
    txHash?: string;
    /**
     * Return only operations of this kind.
     */
    type?: StakingOperationType;
    /**
     * Indexed strictly after this instant.
     */
    whenCreated$gt?: Date;
    /**
     * Indexed at or after this instant.
     */
    whenCreated$gte?: Date;
    /**
     * Indexed strictly before this instant.
     */
    whenCreated$lt?: Date;
    /**
     * Indexed at or before this instant.
     */
    whenCreated$lte?: Date;
}

/**
 * 
 */
export class IndexerApi extends runtime.BaseAPI {

    /**
     * Creates request options for getNetworkConfig without sending the request
     */
    async getNetworkConfigRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/config`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Where everything lives on chain: which node to talk to, which block explorers to link people to, and the addresses of the contracts behind staking, deposits, the batch record, bridged collectibles, governance and network fees.  Ask for these rather than writing them into your code. They differ between test and live, and an address can change when a contract is replaced.  Open to everyone. No sign-in needed. 
     * Get network configuration
     */
    async getNetworkConfigRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<NetworkConfig>> {
        const requestOptions = await this.getNetworkConfigRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => NetworkConfigFromJSON(jsonValue));
    }

    /**
     * Where everything lives on chain: which node to talk to, which block explorers to link people to, and the addresses of the contracts behind staking, deposits, the batch record, bridged collectibles, governance and network fees.  Ask for these rather than writing them into your code. They differ between test and live, and an address can change when a contract is replaced.  Open to everyone. No sign-in needed. 
     * Get network configuration
     */
    async getNetworkConfig(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<NetworkConfig> {
        const response = await this.getNetworkConfigRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNetworkInfo without sending the request
     */
    async getNetworkInfoRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * A quick health check: is the Dual network up, and which version is running? Poll it from a status page or before a batch of work.  Open to everyone. No sign-in needed. 
     * Get network status
     */
    async getNetworkInfoRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<NetworkInfo>> {
        const requestOptions = await this.getNetworkInfoRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => NetworkInfoFromJSON(jsonValue));
    }

    /**
     * A quick health check: is the Dual network up, and which version is running? Poll it from a status page or before a batch of work.  Open to everyone. No sign-in needed. 
     * Get network status
     */
    async getNetworkInfo(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<NetworkInfo> {
        const response = await this.getNetworkInfoRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNetworkStakingInfo without sending the request
     */
    async getNetworkStakingInfoRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/staking`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * A snapshot of staking on the Dual network: how much DUAL is staked right now, how fast rewards are being paid out and when the current reward period ends, how much has been paid and claimed since the beginning, and whether staking is currently paused.  These figures come straight from the staking contract, so they are always up to the minute. That also makes this one of the slower calls here — cache the answer rather than polling it hard.  Amounts are given in wei, the smallest unit of DUAL.  Open to everyone. No sign-in needed. 
     * Get staking contract state
     */
    async getNetworkStakingInfoRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<NetworkStaking>> {
        const requestOptions = await this.getNetworkStakingInfoRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => NetworkStakingFromJSON(jsonValue));
    }

    /**
     * A snapshot of staking on the Dual network: how much DUAL is staked right now, how fast rewards are being paid out and when the current reward period ends, how much has been paid and claimed since the beginning, and whether staking is currently paused.  These figures come straight from the staking contract, so they are always up to the minute. That also makes this one of the slower calls here — cache the answer rather than polling it hard.  Amounts are given in wei, the smallest unit of DUAL.  Open to everyone. No sign-in needed. 
     * Get staking contract state
     */
    async getNetworkStakingInfo(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<NetworkStaking> {
        const response = await this.getNetworkStakingInfoRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNetworkTokenCirculatingSupply without sending the request
     */
    async getNetworkTokenCirculatingSupplyRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/token/circulating-supply`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * How many DUAL are in circulation right now, as a plain number of whole tokens — no JSON wrapper, nothing else in the response:  Circulating supply is the total supply minus everything still locked up and releasing gradually over time, using the deployment\'s configured supply schedule and worked out fresh for each request. The bare number is deliberate: it is the shape price and market trackers expect.  Open to everyone. No sign-in needed. 
     * Get circulating supply
     */
    async getNetworkTokenCirculatingSupplyRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<string>> {
        const requestOptions = await this.getNetworkTokenCirculatingSupplyRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        if (this.isJsonMime(response.headers.get('content-type'))) {
            return new runtime.JSONApiResponse<string>(response);
        } else {
            return new runtime.TextApiResponse(response) as any;
        }
    }

    /**
     * How many DUAL are in circulation right now, as a plain number of whole tokens — no JSON wrapper, nothing else in the response:  Circulating supply is the total supply minus everything still locked up and releasing gradually over time, using the deployment\'s configured supply schedule and worked out fresh for each request. The bare number is deliberate: it is the shape price and market trackers expect.  Open to everyone. No sign-in needed. 
     * Get circulating supply
     */
    async getNetworkTokenCirculatingSupply(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<string> {
        const response = await this.getNetworkTokenCirculatingSupplyRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNetworkTokenMarketData without sending the request
     */
    async getNetworkTokenMarketDataRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/token/market-data`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * What DUAL is worth today: its price, market capitalisation, the last 24 hours of trading and movement, its all-time high and low, and how many tokens exist.  Anything with a price is given per currency — look up `usd`, `eur` or whichever you need by name. The figures come from market data providers and move at their pace, not with every request you make.  Open to everyone. No sign-in needed. 
     * Get token market data
     */
    async getNetworkTokenMarketDataRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<NetworkTokenMarketData>> {
        const requestOptions = await this.getNetworkTokenMarketDataRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => NetworkTokenMarketDataFromJSON(jsonValue));
    }

    /**
     * What DUAL is worth today: its price, market capitalisation, the last 24 hours of trading and movement, its all-time high and low, and how many tokens exist.  Anything with a price is given per currency — look up `usd`, `eur` or whichever you need by name. The figures come from market data providers and move at their pace, not with every request you make.  Open to everyone. No sign-in needed. 
     * Get token market data
     */
    async getNetworkTokenMarketData(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<NetworkTokenMarketData> {
        const response = await this.getNetworkTokenMarketDataRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNetworkTokenPriceHistory without sending the request
     */
    async getNetworkTokenPriceHistoryRequestOpts(requestParameters: GetNetworkTokenPriceHistoryRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['timeRange'] != null) {
            queryParameters['time_range'] = requestParameters['timeRange'];
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/token/price-history`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The DUAL price over time, oldest point first — the line behind a price chart.  `time_range` chooses both how far back to go and how closely to sample, so that every range comes back with a sensible number of points rather than thousands:  | `time_range` | Window | Sampling | | --- | --- | --- | | `today` | Last 24 hours | Every observation, roughly every 5 minutes | | `week` | Last 7 days | Hourly | | `month` | Last 30 days | Hourly | | `year` | Last 12 months | Daily | | `all` | Everything stored | Hourly |  `week` is the default. Prices are given as strings so nothing is rounded away.  Open to everyone. No sign-in needed. 
     * Get token price history
     */
    async getNetworkTokenPriceHistoryRaw(requestParameters: GetNetworkTokenPriceHistoryRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<NetworkTokenPriceHistory>> {
        const requestOptions = await this.getNetworkTokenPriceHistoryRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => NetworkTokenPriceHistoryFromJSON(jsonValue));
    }

    /**
     * The DUAL price over time, oldest point first — the line behind a price chart.  `time_range` chooses both how far back to go and how closely to sample, so that every range comes back with a sensible number of points rather than thousands:  | `time_range` | Window | Sampling | | --- | --- | --- | | `today` | Last 24 hours | Every observation, roughly every 5 minutes | | `week` | Last 7 days | Hourly | | `month` | Last 30 days | Hourly | | `year` | Last 12 months | Daily | | `all` | Everything stored | Hourly |  `week` is the default. Prices are given as strings so nothing is rounded away.  Open to everyone. No sign-in needed. 
     * Get token price history
     */
    async getNetworkTokenPriceHistory(requestParameters: GetNetworkTokenPriceHistoryRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<NetworkTokenPriceHistory> {
        const response = await this.getNetworkTokenPriceHistoryRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getStakingOperationsStats without sending the request
     */
    async getStakingOperationsStatsRequestOpts(requestParameters: GetStakingOperationsStatsRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['interval'] != null) {
            queryParameters['interval'] = requestParameters['interval'];
        }

        if (requestParameters['timeRange'] != null) {
            queryParameters['time_range'] = requestParameters['timeRange'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['whenCreated$gt'] != null) {
            queryParameters['when_created[$gt]'] = (requestParameters['whenCreated$gt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lte'] != null) {
            queryParameters['when_created[$lte]'] = (requestParameters['whenCreated$lte'] as any).toISOString();
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/staking/operations/stats`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Staking activity over time, ready to plot. Each point covers one period and one kind of event, and tells you which kind it was (`key`), how many there were (`count`) and how much DUAL they moved (`amount`, in wei). `total` counts every event in the range you asked for.  Choose a period with `interval`, and a range with either `time_range` or the `when_created` dates — not both, as `time_range` wins.  For a running \"total staked\" line use `/public/network/staking/operations/total`. For how things stand right now use `/public/network/staking`.  Open to everyone. No sign-in needed. 
     * Get staking operation statistics
     */
    async getStakingOperationsStatsRaw(requestParameters: GetStakingOperationsStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StakingOperationsStats>> {
        const requestOptions = await this.getStakingOperationsStatsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StakingOperationsStatsFromJSON(jsonValue));
    }

    /**
     * Staking activity over time, ready to plot. Each point covers one period and one kind of event, and tells you which kind it was (`key`), how many there were (`count`) and how much DUAL they moved (`amount`, in wei). `total` counts every event in the range you asked for.  Choose a period with `interval`, and a range with either `time_range` or the `when_created` dates — not both, as `time_range` wins.  For a running \"total staked\" line use `/public/network/staking/operations/total`. For how things stand right now use `/public/network/staking`.  Open to everyone. No sign-in needed. 
     * Get staking operation statistics
     */
    async getStakingOperationsStats(requestParameters: GetStakingOperationsStatsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StakingOperationsStats> {
        const response = await this.getStakingOperationsStatsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getStakingOperationsTotal without sending the request
     */
    async getStakingOperationsTotalRequestOpts(requestParameters: GetStakingOperationsTotalRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['interval'] != null) {
            queryParameters['interval'] = requestParameters['interval'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['whenCreated$gt'] != null) {
            queryParameters['when_created[$gt]'] = (requestParameters['whenCreated$gt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lte'] != null) {
            queryParameters['when_created[$lte]'] = (requestParameters['whenCreated$lte'] as any).toISOString();
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/staking/operations/total`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The line behind a \"total staked\" chart: how much DUAL was staked in total at each point in time. Each point is the running total at that moment, not the amount that moved during it.  `total` tells you how many points came back.  Amounts are in wei, the smallest unit of DUAL. Figures settle within a minute or two, so something that just happened may not show yet.  Open to everyone. No sign-in needed. 
     * Get cumulative staking totals
     */
    async getStakingOperationsTotalRaw(requestParameters: GetStakingOperationsTotalRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StakingOperationsStats>> {
        const requestOptions = await this.getStakingOperationsTotalRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StakingOperationsStatsFromJSON(jsonValue));
    }

    /**
     * The line behind a \"total staked\" chart: how much DUAL was staked in total at each point in time. Each point is the running total at that moment, not the amount that moved during it.  `total` tells you how many points came back.  Amounts are in wei, the smallest unit of DUAL. Figures settle within a minute or two, so something that just happened may not show yet.  Open to everyone. No sign-in needed. 
     * Get cumulative staking totals
     */
    async getStakingOperationsTotal(requestParameters: GetStakingOperationsTotalRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StakingOperationsStats> {
        const response = await this.getStakingOperationsTotalRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listStakingOperations without sending the request
     */
    async listStakingOperationsRequestOpts(requestParameters: ListStakingOperationsRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['id'] != null) {
            queryParameters['id'] = requestParameters['id'];
        }

        if (requestParameters['autocomplete'] != null) {
            queryParameters['autocomplete'] = requestParameters['autocomplete'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['next'] != null) {
            queryParameters['next'] = requestParameters['next'];
        }

        if (requestParameters['order'] != null) {
            queryParameters['order'] = requestParameters['order'];
        }

        if (requestParameters['sortBy'] != null) {
            queryParameters['sortBy'] = requestParameters['sortBy'];
        }

        if (requestParameters['address'] != null) {
            queryParameters['address'] = requestParameters['address'];
        }

        if (requestParameters['txHash'] != null) {
            queryParameters['tx_hash'] = requestParameters['txHash'];
        }

        if (requestParameters['type'] != null) {
            queryParameters['type'] = requestParameters['type'];
        }

        if (requestParameters['whenCreated$gt'] != null) {
            queryParameters['when_created[$gt]'] = (requestParameters['whenCreated$gt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lte'] != null) {
            queryParameters['when_created[$lte]'] = (requestParameters['whenCreated$lte'] as any).toISOString();
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/staking/operations`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Every stake, unstake, reward payout and fee contribution on the network, newest first, each with the address behind it and the transaction that carried it.  Events appear here shortly after their transaction is mined.  Amounts are given in wei, the smallest unit of DUAL.  Open to everyone. No sign-in needed. 
     * List staking operations
     */
    async listStakingOperationsRaw(requestParameters: ListStakingOperationsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListStakingOperationsOut>> {
        const requestOptions = await this.listStakingOperationsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListStakingOperationsOutFromJSON(jsonValue));
    }

    /**
     * Every stake, unstake, reward payout and fee contribution on the network, newest first, each with the address behind it and the transaction that carried it.  Events appear here shortly after their transaction is mined.  Amounts are given in wei, the smallest unit of DUAL.  Open to everyone. No sign-in needed. 
     * List staking operations
     */
    async listStakingOperations(requestParameters: ListStakingOperationsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListStakingOperationsOut> {
        const response = await this.listStakingOperationsRaw(requestParameters, initOverrides);
        return await response.value();
    }

}

/**
 * @export
 */
export const GetNetworkTokenPriceHistoryTimeRangeEnum = {
    All: 'all',
    Today: 'today',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetNetworkTokenPriceHistoryTimeRangeEnum = typeof GetNetworkTokenPriceHistoryTimeRangeEnum[keyof typeof GetNetworkTokenPriceHistoryTimeRangeEnum];
/**
 * @export
 */
export const GetStakingOperationsStatsIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetStakingOperationsStatsIntervalEnum = typeof GetStakingOperationsStatsIntervalEnum[keyof typeof GetStakingOperationsStatsIntervalEnum];
/**
 * @export
 */
export const GetStakingOperationsStatsTimeRangeEnum = {
    All: 'all',
    Today: 'today',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetStakingOperationsStatsTimeRangeEnum = typeof GetStakingOperationsStatsTimeRangeEnum[keyof typeof GetStakingOperationsStatsTimeRangeEnum];
/**
 * @export
 */
export const GetStakingOperationsTotalIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetStakingOperationsTotalIntervalEnum = typeof GetStakingOperationsTotalIntervalEnum[keyof typeof GetStakingOperationsTotalIntervalEnum];
/**
 * @export
 */
export const ListStakingOperationsOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListStakingOperationsOrderEnum = typeof ListStakingOperationsOrderEnum[keyof typeof ListStakingOperationsOrderEnum];
