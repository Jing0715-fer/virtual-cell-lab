# 通路传播审计报告（修复后·新鲜提取）

- 配体 59 个，级联闭环 49 (83%)
- 死端 9 处 / 孤儿 224 个

| 通路 | 名称 | 配体数 | 配体→可达数 | 死端（→全图可拯救出边） | 孤儿 |
|---|---|---|---|---|---|
| hsa04010 | MAPK 信号通路 | 2 | TGFB1(15)<br>EGF(25) | — | DUSP1[phosphatase]<br>DAG[compound]<br>SOS1[adapter]<br>DUSP5[phosphatase]<br>TRAF2[adapter]<br>PAK1[kinase]<br>MAP2K7[kinase]<br>MAP3K8[kinase]<br>SRF[tf] |
| hsa04151 | PI3K-Akt 信号通路 | 1 | IGF1(20) | MAP2K1[kinase]→MAPK1 | PTEN[phosphatase]<br>DDIT4[enzyme]<br>CRTC2[tf]<br>PIK3R6[adapter]<br>PTK2[kinase]<br>RAC1[gtpase]<br>JAK1[kinase]<br>AMP[compound] |
| hsa04310 | Wnt 信号通路 | 6 | WNT5A(31)<br>DKK1 ⊣输出型(0)<br>WIF1 ⊣输出型(0)<br>SFRP1 ⊣输出型(0)<br>WNT3A(31)<br>SOST ⊣输出型(0) | — | SOX17[tf]<br>SMAD4[tf]<br>CREBBP[tf]<br>NLK[kinase]<br>CSNK1A1[kinase]<br>SIAH1[enzyme]<br>NKD1[enzyme]<br>PRKACA[kinase]<br>PORCN[enzyme]<br>BAMBI[enzyme] |
| hsa04330 | Notch 信号通路 | 2 | JAG1(8)<br>DLL1(8) | — | NCSTN[enzyme]<br>APH1A[enzyme]<br>PSEN1[enzyme]<br>HDAC1[enzyme]<br>CIRSR[enzyme]<br>TLE7[enzyme]<br>CTBP1[enzyme]<br>NCOR2[enzyme]<br>KAT2B[tf]<br>MAML1[tf]<br>ADAM17[enzyme]<br>PSENEN[enzyme]<br>NUMB[adapter]<br>DVL1[adapter]<br>LFNG[enzyme]<br>ATXN1L[enzyme]<br>SPEN[enzyme]<br>ITCH[adapter]<br>RITA1[enzyme] |
| hsa04350 | TGF-β 信号通路 | 8 | NODAL(11)<br>INHBA(11)<br>LEFTY1 ⊣输出型(0)<br>TGFB1(11)<br>TNF(2)<br>IFNG(2)<br>BMP4(12)<br>INHBB(11) | RHOA[gtpase]→ROCK1 | ACVR1C[receptor]<br>SP1[tf]<br>EP300[tf]<br>MAPK1[kinase]<br>TGIF2[tf]<br>SKI[tf] |
| hsa04630 | JAK-STAT 信号通路 | 5 | IL2(10)<br>EPO(8)<br>IL6(11)<br>IFNA1(11)<br>IFNG(10) | — | PIAS1[enzyme]<br>PTPN2[phosphatase] |
| hsa04024 | cAMP 信号通路 | 1 | EPI(31) | — | 多巴胺[compound]<br>PGI₂[compound]<br>血清素[compound]<br>ACh[compound]<br>GABA[compound]<br>肾上腺素[compound]<br>腺苷[compound]<br>HCO₃⁻[compound]<br>Ca²⁺[compound]<br>乳酸[compound]<br>去甲肾上腺素[compound]<br>PPP1CA[phosphatase]<br>油酰乙醇胺[compound]<br>β-羟基丁酸[compound]<br>3-羟基辛酸[compound]<br>琥珀酸[compound]<br>PGE₂[compound] |
| hsa04020 | 钙信号通路 | 1 | ACh(16) | — | ITPKA[enzyme]<br>VDAC1[enzyme]<br>PPIF[enzyme]<br>SLC8A2[enzyme]<br>CAMK2A[kinase]<br>PPP3CA[phosphatase]<br>PTK2B[kinase]<br>CD38[enzyme]<br>PLCE1[enzyme]<br>102723407[enzyme]<br>EGFR[receptor]<br>PLCZ1[enzyme]<br>PHKA1[enzyme]<br>CACNA1C[channel]<br>CACNA1A[channel]<br>CYSLTR1[receptor]<br>TNNC2[enzyme]<br>SLC25A4[enzyme]<br>GNAL[gtpase]<br>CACNA1I[channel]<br>ATP2B1[channel]<br>STIM1[enzyme]<br>CASQ1[enzyme]<br>HRC[enzyme]<br>PI(3,5)P₂[compound]<br>ERLN[gtpase] |
| hsa04150 | mTOR 信号通路 | 2 | IGF1(19)<br>WNT2 ⚠未闭环(3) | GRB2[adapter]→SOS1 | MAPK1[kinase]<br>AMP[compound]<br>DDIT4[enzyme]<br>IKBKB[kinase]<br>SLC7A5[enzyme]<br>ATP6V1A[enzyme]<br>FNIP2[enzyme]<br>STK11[kinase]<br>STRADA[adapter]<br>CAB39[adapter] |
| hsa04064 | NF-κB 信号通路 | 1 | TNF(19) | — | CHUK[kinase]<br>RELB[tf]<br>TLR4[receptor] |
| hsa04210 | 细胞凋亡通路 | 1 | FASLG(13) | — | NFKB1[tf]<br>AKT1[kinase]<br>TNFRSF1A[receptor]<br>JUN[tf]<br>MCL1[enzyme] |
| hsa04115 | p53 信号通路 | 1 | IGF1 ⊣输出型(0) | — | MDM4[enzyme]<br>ATR[kinase]<br>ATM[kinase]<br>CDKN2A[enzyme]<br>APAF1[enzyme]<br>BBC3[enzyme] |
| hsa04152 | AMPK 信号通路 | 0 |  | — | AKT3[kinase]<br>STK11[kinase]<br>NAD⁺[compound]<br>ADIPOR1[enzyme]<br>C00083[compound]<br>HNF4A[enzyme]<br>STRADA[adapter]<br>CAB39[adapter]<br>ADRA1A[receptor]<br>MAP3K7[kinase] |
| hsa04370 | VEGF 信号通路 | 1 | VEGFA(25) | — | — |
| hsa04390 | Hippo 信号通路 | 0 |  | — | WWC1[enzyme]<br>NF2[enzyme]<br>FRMD6[enzyme]<br>RASSF1[enzyme]<br>PPP1CA[phosphatase]<br>PATJ[enzyme]<br>LLGL2[enzyme]<br>SCRIB[enzyme]<br>DLG1[adapter]<br>TEAD1[tf]<br>PARD3[adapter]<br>FZD10[receptor]<br>PPP2CA[phosphatase] |
| hsa04066 | HIF-1 信号通路 | 2 | IGF1(6)<br>IGF2(6) | — | RBX1[enzyme]<br>TCEB2[enzyme]<br>TCEB1[enzyme]<br>VHL[enzyme]<br>ARNT[tf]<br>DAG[compound]<br>Ca²⁺[compound]<br>NFKB1[tf]<br>STAT3[tf]<br>NO[compound]<br>O₂[compound]<br>Fe²⁺[compound]<br>抗坏血酸[compound]<br>2-OG[compound]<br>MAPK1[kinase] |
| hsa04068 | FoxO 信号通路 | 3 | INS(8)<br>IGF1(8)<br>TGFB1(2) | — | MAPK8[kinase]<br>CDK2[kinase]<br>SMAD4[tf]<br>STAT3[tf]<br>NLK[kinase]<br>MAPK14[kinase]<br>SETD7[enzyme]<br>USP7[enzyme]<br>ADP[compound]<br>AMP[compound] |
| hsa04620 | Toll 样受体信号通路 | 2 | IFNB1 ⚠未闭环(1)<br>LPS(33) | IFNAR1[receptor]→JAK1,TYK2<br>FADD[adapter]→CASP8 | CHUK[kinase]<br>MAP3K8[kinase]<br>TAB1[adapter]<br>LY96[enzyme]<br>TLR5[receptor]<br>TLR3[receptor]<br>TLR1[enzyme]<br>TLR6[receptor]<br>TLR9[receptor]<br>CD14[enzyme] |
| hsa04110 | 细胞周期 | 1 | TGFB1(3) | — | CDKN2A[enzyme]<br>SKP1[enzyme]<br>BUB1B[kinase]<br>ATM[kinase]<br>MAD2L1[enzyme]<br>BUB1[kinase]<br>CREBBP[tf]<br>SKP2[enzyme]<br>WEE1[kinase]<br>ESPL1[enzyme]<br>SMAD4[tf]<br>CDC20[enzyme]<br>GSK3B[kinase]<br>CDK7[kinase]<br>CCNH[enzyme]<br>CDKN2C[enzyme]<br>CDKN2D[enzyme] |
| hsa04012 | ErbB 信号通路 | 10 | TGFA(25)<br>NRG3(16)<br>NRG2(17)<br>HBEGF(26)<br>NRG1(17)<br>EREG(26)<br>BTC(26)<br>NRG4(16)<br>AREG(25)<br>EGF(25) | PAK4[kinase]→MAP2K7 | ERBB2[receptor] |
| hsa04340 | Hedgehog 信号通路 | 1 | SAG(18) | — | CUL1[enzyme]<br>SMURF1[adapter]<br>GRK2[kinase]<br>KIF3A[enzyme]<br>CUL3[enzyme]<br>MEGF8[enzyme]<br>MGRN1[enzyme]<br>MOSMO[enzyme]<br>IQCE[enzyme]<br>HHATL[enzyme] |
| hsa04014 | Ras 信号通路 | 2 | CSF1(34)<br>5-HT(35) | BRAP[enzyme]→KSR2<br>EXOC2[enzyme]→TBK1<br>CHUK[kinase]→NFKB1 | PLCG1[enzyme] |
| hsa04623 | 胞质 DNA 感知通路 | 3 | IL18 ⊣输出型(0)<br>IL33 ⊣输出型(0)<br>dsDNA(35) | — | ADAR[enzyme]<br>TREX1[enzyme]<br>DNASE2[enzyme]<br>SAMHD1[enzyme]<br>NLRP3[enzyme]<br>MEFV[enzyme]<br>ZDHHC1[enzyme] |
| hsa04071 | 鞘脂信号通路 | 2 | S1P(31)<br>TNF(12) | — | ADORA1[receptor]<br>FYN[kinase] |
| hsa04621 | NOD 样受体信号通路 | 1 | MDP(34) | — | NLRC4[enzyme]<br>SUGT1[enzyme]<br>MEFV[enzyme]<br>AIM2[enzyme]<br>IRAK4[kinase]<br>TXNIP[enzyme]<br>CYBB[enzyme] |