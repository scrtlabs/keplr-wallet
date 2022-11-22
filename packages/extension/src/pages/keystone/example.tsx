import { MsgSend } from "@keplr-wallet/proto-types/cosmos/bank/v1beta1/tx";
import {
  AuthInfo,
  TxBody,
  TxRaw,
} from "@keplr-wallet/proto-types/cosmos/tx/v1beta1/tx";
import { PubKey } from "@keplr-wallet/proto-types/cosmos/crypto/secp256k1/keys";
import React, { useCallback } from "react";
import { Button } from "reactstrap";
import { useStore } from "../../stores";
import Long from "long";
import { SignMode } from "@keplr-wallet/proto-types/cosmos/tx/signing/v1beta1/signing";
import { Hash, PubKeySecp256k1 } from "@keplr-wallet/crypto";
import { BroadcastMode, EthSignType, StdSignature } from "@keplr-wallet/types";

import { JsonRpcProvider } from "@ethersproject/providers";
import { evmosToEth } from "@tharsis/address-converter";
import { recoverPersonalSignature, recoverTypedSignature } from "eth-sig-util";

enum TransactionType {
  EIP1559 = 2,
  EIP2930 = 1,
  Legacy = 0,
}

const ethProvider = new JsonRpcProvider("https://eth.bd.evmos.dev:8545");

async function signAndBroadcastEthereumTx(
  chainId: string,
  signerAddressBech32: string,
  transactionType: TransactionType
) {
  // Get Keplr signer address in hex
  const signerAddressEth = evmosToEth(signerAddressBech32);
  console.log("signerAddressEth", signerAddressEth);

  // Define Ethereum Tx
  const ethSendTx: any = {
    chainId: 9000,
    from: signerAddressEth,
    to: "0xee7b8F17E041AE5126A403Ec4cD5FE344b51d7EB",
    gasLimit: `0x${Buffer.from("50000").toString("hex")}`,
    value: `0x${Buffer.from("300000").toString("hex")}`,
    accessList: [],
    type: transactionType,
  };

  // Calculate and set nonce
  const nonce = await ethProvider.getTransactionCount(signerAddressEth);
  ethSendTx["nonce"] = nonce;

  // Calculate and set gas fees
  const gasLimit = await ethProvider.estimateGas(ethSendTx);
  const gasFee = await ethProvider.getFeeData();

  ethSendTx["gasLimit"] = gasLimit.toHexString();
  if (!gasFee.maxPriorityFeePerGas || !gasFee.maxFeePerGas) {
    // Handle error
    return;
  }
  if (transactionType === TransactionType.EIP1559) {
    ethSendTx[
      "maxPriorityFeePerGas"
    ] = gasFee.maxPriorityFeePerGas.toHexString();
    ethSendTx["maxFeePerGas"] = gasFee.maxFeePerGas.toHexString();
  } else {
    ethSendTx["gasPrice"] = gasFee.maxFeePerGas.toHexString();
  }
  if (transactionType === TransactionType.EIP2930) {
    ethSendTx.accessList.push({
      address: "0xee7b8F17E041AE5126A403Ec4cD5FE344b51d7EB",
      storageKeys: [
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      ],
    });
  }

  const rlpEncodedTx: any = await window.keplr?.signEthereum(
    chainId,
    signerAddressBech32,
    JSON.stringify(ethSendTx),
    EthSignType.TRANSACTION
  );

  const res = await ethProvider.sendTransaction(rlpEncodedTx);
  console.log("signAndBroadcastEthereumTx", res);
  return res;
}

export function KeystoneExamplePage() {
  const { chainStore, accountStore } = useStore();

  const verify = (
    dataHexString: string,
    signatureHexString: string,
    isEth: boolean = false
  ) => {
    const data = Buffer.from(dataHexString, "hex");
    const current = chainStore.current;
    const accountInfo = accountStore.getAccount(current.chainId);
    const pubKey = new PubKeySecp256k1(accountInfo.pubKey);
    const res = pubKey.verifyDigest32(
      isEth ? Hash.keccak256(data) : Hash.sha256(data),
      Buffer.from(signatureHexString, "hex")
    );
    return res;
  };

  async function signAndBroadcastEthereumTypedData(
    chainId: string,
    signerAddressBech32: string
  ) {
    // Get Keplr signer address in hex
    const signerAddressEth = evmosToEth(signerAddressBech32);
    console.log("signerAddressEth", signerAddressEth);

    // https://github.com/apurbapokharel/EIP712Example/blob/master/client/src/App.js
    const data = {
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        set: [
          { name: "sender", type: "address" },
          { name: "x", type: "uint" },
          { name: "deadline", type: "uint" },
        ],
      },
      //make sure to replace verifyingContract with address of deployed contract
      primaryType: "set",
      domain: {
        name: "SetTest",
        version: "1",
        chainId: 9000,
        verifyingContract: "0x803B558Fd23967F9d37BaFe2764329327f45e89E",
      },
      message: {
        sender: signerAddressEth,
        x: 157,
        deadline: parseInt(String(Date.now() / 1000 + 100).slice(0, 10)),
      },
    };

    console.log(
      chainId,
      signerAddressBech32,
      JSON.stringify(data),
      EthSignType.EIP712
    );
    console.log(evmosToEth(signerAddressBech32));
    const signRes: any = await window.keplr?.signEthereum(
      chainId,
      signerAddressBech32,
      JSON.stringify(data),
      EthSignType.EIP712
    );

    const recoveredAddr = recoverTypedSignature({
      data,
      sig: `0x${Buffer.from(signRes).toString("hex")}`,
    });
    console.log("recoveredAddr", recoveredAddr);
    alert(
      `Verify: ${
        recoveredAddr.toLowerCase() ===
        evmosToEth(signerAddressBech32).toLowerCase()
      }`
    );
  }

  async function signAndVerifyMessage(
    chainId: string,
    signerAddressBech32: string
  ) {
    const data = "123456";
    console.log(chainId, signerAddressBech32, data, EthSignType.MESSAGE);
    const signRes: any = await window.keplr?.signEthereum(
      chainId,
      signerAddressBech32,
      data,
      EthSignType.MESSAGE
    );
    const signature = Buffer.from(signRes).toString("hex");
    console.log("signRes", signature);
    const recoveredAddr = recoverPersonalSignature({
      data: `0x${Buffer.from(data).toString("hex")}`,
      sig: `0x${Buffer.from(signRes).toString("hex")}`,
    });
    console.log("recoveredAddr", recoveredAddr);
    alert(
      `Verify: ${
        recoveredAddr.toLowerCase() ===
        evmosToEth(signerAddressBech32).toLowerCase()
      }`
    );
  }

  const signDirect = useCallback(async () => {
    const toAddr = "osmo1ptq7fgx0cgghlpjsvarr5kznlkj3h7tmgr0p4d";
    const current = chainStore.current;
    const accountInfo = accountStore.getAccount(current.chainId);
    console.log(current.chainId, accountInfo.bech32Address);
    if (!/osmosis/i.test(current.chainName)) {
      alert("Chain is not Osmosis");
      return;
    }
    if (!current.chainId || !accountInfo.bech32Address) {
      setTimeout(signDirect, 100);
      return;
    }

    const feeCurrency = current.feeCurrencies[0];
    const currency = current.currencies[0];

    const account = await fetch(
      `${current.rest}/cosmos/auth/v1beta1/accounts/${accountInfo.bech32Address}`
    )
      .then((e) => e.json())
      .then((e) => e.account);
    console.log(account);

    const signRes = await window.keplr?.signDirect(
      current.chainId,
      accountInfo.bech32Address,
      {
        bodyBytes: TxBody.encode({
          messages: [
            {
              typeUrl: "/cosmos.bank.v1beta1.MsgSend",
              value: MsgSend.encode({
                fromAddress: accountInfo.bech32Address,
                toAddress: toAddr,
                amount: [
                  {
                    denom: currency.coinMinimalDenom,
                    amount: "10000",
                  },
                ],
              }).finish(),
            },
          ],
          memo: "ABC",
          timeoutHeight: "0",
          extensionOptions: [],
          nonCriticalExtensionOptions: [],
        }).finish(),
        authInfoBytes: AuthInfo.encode({
          signerInfos: [
            {
              publicKey: {
                typeUrl: "/cosmos.crypto.secp256k1.PubKey",
                value: PubKey.encode({
                  key: (await window.keplr.getKey(current.chainId)).pubKey,
                }).finish(),
              },
              modeInfo: {
                single: {
                  mode: SignMode.SIGN_MODE_DIRECT,
                },
                multi: undefined,
              },
              sequence: account.sequence,
            },
          ],
          fee: {
            amount: [
              {
                denom: feeCurrency.coinDenom,
                amount: "1000",
              },
            ],
            gasLimit: "100000",
            payer: accountInfo.bech32Address,
            granter: "",
          },
        }).finish(),
        chainId: current.chainId,
        accountNumber: Long.fromString(account.account_number),
      }
    );
    if (signRes) {
      console.log("signRes", signRes);
      try {
        const sendRes = await window.keplr?.sendTx(
          current.chainId,
          TxRaw.encode({
            bodyBytes: signRes.signed.bodyBytes,
            authInfoBytes: signRes.signed.authInfoBytes,
            signatures: [Buffer.from(signRes.signature.signature, "base64")],
          }).finish(),
          "block" as BroadcastMode
        );
        sendRes && console.log("sendRes", Buffer.from(sendRes).toString());
      } catch (err) {
        console.error(err);
      } finally {
        window.location.hash = "#/keystone/example";
      }
    }
  }, [accountStore, chainStore]);

  const signArbitrary = useCallback(
    async (data: string | Uint8Array) => {
      const accountInfo = accountStore.getAccount(chainStore.current.chainId);
      console.log(chainStore.current.chainId, accountInfo.bech32Address);
      if (!chainStore.current.chainId || !accountInfo.bech32Address) {
        console.log("Try again!");
        return;
      }
      try {
        const params: [string, string, string | Uint8Array, StdSignature] = [
          chainStore.current.chainId,
          accountInfo.bech32Address,
          data,
          {} as StdSignature,
        ];
        const signRes = await window.keplr?.signArbitrary(
          params[0],
          params[1],
          params[2]
        );
        console.log("signRes", signRes);
        if (signRes) {
          params[3] = signRes;
          const verifyRes = await window.keplr?.verifyArbitrary(...params);
          console.log("verifyRes", verifyRes);
        }
      } catch (err) {
        console.error(err);
      } finally {
        window.location.hash = "#/keystone/example";
      }
    },
    [accountStore, chainStore]
  );
  const signArbitraryString = useCallback(async () => {
    signArbitrary("123");
  }, [signArbitrary]);
  const signArbitraryBuffer = useCallback(async () => {
    signArbitrary(Buffer.from("ABC"));
  }, [signArbitrary]);

  const signEthereum = useCallback(
    async (signType: EthSignType, transactionType?: TransactionType) => {
      const current = chainStore.current;
      const accountInfo = accountStore.getAccount(current.chainId);
      console.log(current.chainId, accountInfo.ethereumHexAddress);
      if (!/evmos/i.test(current.chainName)) {
        alert("Chain is not Evmos");
        return;
      }
      if (!current.chainId || !accountInfo.ethereumHexAddress) {
        setTimeout(() => {
          signEthereum(signType, transactionType);
        }, 100);
        return;
      }

      try {
        let data: any;
        if (signType === EthSignType.TRANSACTION) {
          await signAndBroadcastEthereumTx(
            current.chainId,
            accountInfo.bech32Address,
            transactionType as TransactionType
          );
        } else if (signType === EthSignType.EIP712) {
          await signAndBroadcastEthereumTypedData(
            current.chainId,
            accountInfo.bech32Address
          );
        } else if (signType === EthSignType.MESSAGE) {
          await signAndVerifyMessage(
            current.chainId,
            accountInfo.bech32Address
          );
        }
        console.log("data", data);
      } catch (err) {
        console.error(err);
      } finally {
        window.location.hash = "#/keystone/example";
      }
    },
    [chainStore, accountStore]
  );

  const signEthereumEIP712 = useCallback(async () => {
    signEthereum(EthSignType.EIP712);
  }, [signEthereum]);

  const signEthereumMessage = useCallback(async () => {
    signEthereum(EthSignType.MESSAGE);
  }, [signEthereum]);

  const experimentalSignEIP712CosmosTx_v0 = useCallback(async () => {
    const current = chainStore.current;
    const accountInfo = accountStore.getAccount(current.chainId);
    console.log(current.chainId, accountInfo.ethereumHexAddress);
    if (!current.chainId || !accountInfo.ethereumHexAddress) {
      console.log("Try again!");
      return;
    }
    const account = await fetch(
      `${current.rest}/cosmos/auth/v1beta1/accounts/${accountInfo.bech32Address}`
    )
      .then((e) => e.json())
      .then((e) => e.account);
    try {
      const msg = {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
            { name: "salt", type: "bytes32" },
          ],
          Bid: [
            { name: "amount", type: "uint256" },
            { name: "bidder", type: "Identity" },
          ],
          Identity: [
            { name: "userId", type: "uint256" },
            { name: "wallet", type: "address" },
          ],
        },
        domain: {
          name: "Auction dApp",
          version: "2",
          chainId: 9000,
          verifyingContract: "0x1C56346CD2A2Bf3202F771f50d3D14a367B48070",
          salt:
            "0xf2d857f4a3edcb9b78b4d503bfe733db1e3f6cdc2b7971ee739626c97e86a558",
        },
        primaryType: "Bid",
      };
      const signRes = await window.keplr?.experimentalSignEIP712CosmosTx_v0(
        current.chainId,
        accountInfo.bech32Address,
        msg,
        {
          chain_id: current.chainId,
          account_number: account.account_number,
          sequence: account.sequence,
          fee: {
            amount: [
              {
                denom: current.feeCurrencies[0].coinDenom,
                amount: "1000",
              },
            ],
            gas: "100000",
            payer: accountInfo.bech32Address,
            granter: "",
          },
          msgs: [
            {
              type: "AAA",
              value: {
                amount: 100,
                bidder: {
                  userId: 323,
                  wallet: "0x3333333333333333333333333333333333333333",
                },
              },
            },
          ],
          memo: "123",
        }
      );
      console.log("signRes", signRes, signRes?.signature);
      const recoveredAddr = recoverTypedSignature({
        data: msg,
        sig: `0x${Buffer.from(signRes?.signature).toString("hex")}`,
      });
      console.log("recoveredAddr", recoveredAddr);
      alert(
        `Verify: ${
          recoveredAddr.toLowerCase() ===
          accountInfo.ethereumHexAddress.toLowerCase()
        }`
      );
    } catch (err) {
      console.error(err);
    } finally {
      window.location.hash = "#/keystone/example";
    }
  }, [chainStore, accountStore]);

  const verifySignature = () => {
    console.log("verifySignature", verify("", "", false));
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-start",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <p>
        <Button onClick={verifySignature}>Verify Signature</Button>
      </p>
      <p>Chain: Osmosis</p>
      <p>
        <Button onClick={signDirect}>Sign Direct</Button>
      </p>
      <p>
        <Button onClick={signArbitraryString}>Sign Arbitrary String</Button>
      </p>
      <p>
        <Button onClick={signArbitraryBuffer}>Sign Arbitrary Buffer</Button>
      </p>
      <p>Chain: Evmos</p>
      <p>
        <Button
          onClick={() =>
            signEthereum(EthSignType.TRANSACTION, TransactionType.EIP1559)
          }
        >
          Sign Eth Transaction EIP-1559
        </Button>
      </p>
      <p>
        <Button
          onClick={() =>
            signEthereum(EthSignType.TRANSACTION, TransactionType.EIP2930)
          }
        >
          Sign Eth Transaction EIP-2930 (Not Support)
        </Button>
      </p>
      <p>
        <Button
          onClick={() =>
            signEthereum(EthSignType.TRANSACTION, TransactionType.Legacy)
          }
        >
          Sign Eth Transaction Legacy
        </Button>
      </p>
      <p>
        <Button onClick={signEthereumEIP712}>Sign Eth EIP712</Button>
      </p>
      <p>
        <Button onClick={signEthereumMessage}>Sign Eth Message</Button>
      </p>
      <p>
        <Button onClick={experimentalSignEIP712CosmosTx_v0}>
          Sign EIP712CosmosTx_v0
        </Button>
      </p>
    </div>
  );
}
